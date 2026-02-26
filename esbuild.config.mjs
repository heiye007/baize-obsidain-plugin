import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import process from "process";
import builtins from "builtin-modules";
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

// ─── esbuild CSS 合并插件 ───
const cssMergePlugin = {
    name: "css-merge",
    setup(build) {
        build.onEnd(() => {
            mergeCSS();
            copyManifest();
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
        ".wasm": "file",
    },
    plugins: [
        esbuildSvelte({
            preprocess: sveltePreprocess(),
            compilerOptions: {
                dev: !isProduction,
            },
        }),
        cssMergePlugin,
    ],
    define: {
        "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
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
