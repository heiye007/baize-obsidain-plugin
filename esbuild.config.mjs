import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";
import { readFileSync, readdirSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

// ─── CSS 合并：将 styles/ 下所有 CSS 合并为 build/styles.css ───
function mergeCSS() {
    const stylesDir = resolve("styles");
    if (!existsSync(stylesDir)) return;

    const order = ["variables.css", "base.css", "components.css", "desktop.css", "mobile.css"];
    const files = readdirSync(stylesDir).filter(f => f.endsWith(".css"));
    const sorted = [
        ...order.filter(f => files.includes(f)),
        ...files.filter(f => !order.includes(f))
    ];

    let combined = `/* 白泽 Baize - Auto-merged from styles/ */\n\n`;
    for (const file of sorted) {
        const content = readFileSync(join(stylesDir, file), "utf-8");
        combined += `/* ═══ ${file} ═══ */\n${content}\n\n`;
    }

    const buildDir = resolve("build");
    if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, "styles.css"), combined);
    console.log(`✅ styles.css merged (${sorted.length} files)`);
}

// ─── manifest.json 拷贝到 build/ ───
function copyManifest() {
    const buildDir = resolve("build");
    if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
    if (existsSync("manifest.json")) {
        copyFileSync("manifest.json", join(buildDir, "manifest.json"));
    }
}

// ─── ONNX WASM 文件拷贝 ───
function copyOnnxWasm() {
    const wasmDir = resolve("node_modules/onnxruntime-web/dist");
    const buildDir = resolve("build");
    if (!existsSync(wasmDir)) return;
    const wasmFiles = readdirSync(wasmDir).filter(f => f.startsWith("ort-wasm") && (f.endsWith(".wasm") || f.endsWith(".mjs")));
    for (const file of wasmFiles) {
        copyFileSync(join(wasmDir, file), join(buildDir, file));
    }
    if (wasmFiles.length > 0) {
        console.log(`✅ ONNX WASM & Worker files copied (${wasmFiles.length} files)`);
    }
}

// ─── 复制 transformers 和 onnxruntime-web 到 build/node_modules ───
function copyTransformersModules() {
    console.log("📦 Copying transformers modules...");
    try {
        const buildNodeModules = resolve("build/node_modules");

        // 创建目标目录
        if (!existsSync(buildNodeModules)) {
            mkdirSync(buildNodeModules, { recursive: true });
        }

        // 复制 @huggingface/transformers
        const transformersSrc = resolve("node_modules/@huggingface/transformers");
        const transformersDest = join(buildNodeModules, "@huggingface");
        console.log(`  Source: ${transformersSrc}`);
        console.log(`  Dest: ${transformersDest}`);

        if (existsSync(transformersSrc)) {
            // 确保 @huggingface 目录存在
            if (!existsSync(transformersDest)) {
                mkdirSync(transformersDest, { recursive: true });
            }
            const finalDest = join(transformersDest, "transformers");
            // 删除旧的
            if (existsSync(finalDest)) {
                fs.rmSync(finalDest, { recursive: true, force: true });
            }
            // 递归复制整个目录
            console.log(`  Copying to: ${finalDest}`);
            fs.cpSync(transformersSrc, finalDest, { recursive: true });
            console.log(`✅ Copied @huggingface/transformers to build/node_modules`);
        } else {
            console.warn(`⚠️  @huggingface/transformers not found at ${transformersSrc}`);
        }

        // 复制 onnxruntime-web
        const onnxSrc = resolve("node_modules/onnxruntime-web");
        const onnxDest = join(buildNodeModules, "onnxruntime-web");
        if (existsSync(onnxSrc)) {
            if (existsSync(onnxDest)) {
                fs.rmSync(onnxDest, { recursive: true, force: true });
            }
            fs.cpSync(onnxSrc, onnxDest, { recursive: true });
            console.log(`✅ Copied onnxruntime-web to build/node_modules`);
        } else {
            console.warn(`⚠️  onnxruntime-web not found at ${onnxSrc}`);
        }
    } catch (error) {
        console.error("❌ Error copying transformers modules:", error);
    }
}

// ─── esbuild CSS 合并插件 ───
const cssMergePlugin = {
    name: "css-merge",
    setup(build) {
        build.onEnd(() => {
            mergeCSS();
            copyManifest();
            copyOnnxWasm();
            // copyTransformersModules(); // 太慢，移到部署脚本中
        });
    }
};

// ─── 递归扫描 Worker 入口文件 (.worker.ts) ───
function findWorkerEntries() {
    const srcDir = resolve("src");
    const entries = [];
    function scan(dir) {
        if (!existsSync(dir)) return;
        for (const item of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
                scan(fullPath);
            } else if (item.name.endsWith(".worker.ts")) {
                entries.push(fullPath);
            }
        }
    }
    scan(srcDir);
    return entries;
}

// ─── worker_threads polyfill 插件 ───
// 防止 ONNX Runtime 尝试加载 worker_threads 模块
const workerThreadsPolyfillPlugin = {
    name: "worker-threads-polyfill",
    setup(build) {
        build.onResolve({ filter: /^worker_threads$/ }, () => {
            return { path: resolve("src/stubs/worker_threads.ts") };
        });
    },
};

// ─── 字符串替换插件 ───
// 直接替换代码中的 worker_threads 导入
const stringReplacePlugin = {
    name: "string-replace",
    setup(build) {
        build.onEnd(async () => {
            const mainJsPath = resolve("build/main.js");
            if (!existsSync(mainJsPath)) return;

            let content = readFileSync(mainJsPath, "utf-8");

            // 替换所有尝试动态导入 worker_threads 的代码
            // 将 import("worker_threads") 替换为 Promise.resolve({})
            content = content.replace(
                /import\s*\(\s*["']worker_threads["']\s*\)/g,
                "Promise.resolve({})"
            );

            // 替换 await import('worker_threads')
            content = content.replace(
                /await\s+import\s*\(\s*["']worker_threads["']\s*\)/g,
                "{}"
            );

            writeFileSync(mainJsPath, content);
            console.log("✅ Replaced worker_threads imports in main.js");
        });
    },
};

// ─── 主构建上下文 (main.ts → build/main.js) ───
const mainContext = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        "@lancedb/lancedb",
        ...builtins,
    ],
    format: "cjs",
    target: "es2022",
    logLevel: "info",
    sourcemap: isProduction ? false : "inline",
    treeShaking: true,
    outfile: "build/main.js",
    minify: isProduction,
    loader: {
        ".wasm": "binary",
    },
    plugins: [
        workerThreadsPolyfillPlugin,
        esbuildSvelte({
            preprocess: sveltePreprocess(),
            compilerOptions: {
                dev: !isProduction,
            },
        }),
        cssMergePlugin,
        stringReplacePlugin,
    ],
    banner: {
        js: `
// ═══ Baize Polyfill - 必须在任何模块加载前执行 ═══
// 拦截动态 import，防止 onnxruntime-web 尝试加载 worker_threads
(function() {
    // 拦截 globalThis.import (ES module 动态导入)
    const originalImport = globalThis.import;
    if (originalImport) {
        globalThis.import = function(specifier) {
            if (specifier === 'worker_threads' || specifier.includes('worker_threads')) {
                return Promise.resolve({});
            }
            return originalImport.call(this, specifier);
        };
    }

    // 在模块加载前设置 ortWasmThreaded = false
    if (typeof window !== 'undefined') {
        window.ortWasmThreaded = false;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.ortWasmThreaded = false;
    }

    // 预配置 onnxruntime-web 环境变量
    if (typeof process === 'undefined') {
        globalThis.process = { env: {} };
    }
    if (!process.env) {
        process.env = {};
    }
    process.env.ONNX_WEB_THREADS = '0';
    process.env.ORT_WEB_WORKER = '0';
})();
`,
    },
    define: {
        "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
        // onnxruntime-web 在模块初始化时调用 fileURLToPath(import.meta.url)
        // 在 CJS bundle 中 import.meta.url 为 undefined 会导致崩溃
        // 在 Windows 下必须提供一个绝对路径格式的 URL 才能通过校验
        "import.meta.url": '"file:///C:/baize.js"',

        // 【关键修复】
        // Obsidian 运行在 Electron 中，process.release.name 会被判断为 "node"
        // 这导致 @xenova/transformers 内部错误加载了不兼容前端的 onnxruntime-node
        // 强制其认为不是 node 环境，从而加载 onnxruntime-web
        "process.release.name": '"browser"',
    },
});

// ─── Worker 构建上下文 (*.worker.ts → build/*.worker.js) ───
// Worker 独立打包，iife 格式完全自包含，不引用 obsidian 等外部模块
const workerEntries = findWorkerEntries();
let workerContext = null;

if (workerEntries.length > 0) {
    workerContext = await esbuild.context({
        entryPoints: workerEntries,
        bundle: true,
        format: "iife",
        target: "es2022",
        logLevel: "info",
        sourcemap: isProduction ? false : "inline",
        treeShaking: true,
        outdir: "build",
        minify: isProduction,
        loader: {
            ".wasm": "file",
        },
        define: {
            "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
        },
    });
    const names = workerEntries.map(e => e.split(/[/\\]/).pop()).join(", ");
    console.log(`🔧 Found ${workerEntries.length} worker(s): ${names}`);
}

// ─── 构建 / 监听 ───
if (isWatch) {
    await mainContext.watch();
    if (workerContext) await workerContext.watch();
    console.log("👁️  Watching for changes...");
} else {
    await mainContext.rebuild();
    if (workerContext) await workerContext.rebuild();
    await mainContext.dispose();
    if (workerContext) await workerContext.dispose();
    console.log(isProduction ? "📦 Production build complete." : "🔨 Build complete.");
}
