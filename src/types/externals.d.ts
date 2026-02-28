/**
 * 外部模块类型声明
 * 
 * LanceDB 通过动态 import 加载，运行时按需安装
 * 这里声明模块类型让 TypeScript 编译通过
 */
declare module "@lancedb/lancedb" {
    export function connect(uri: string): Promise<Connection>;

    export interface Connection {
        tableNames(): Promise<string[]>;
        openTable(name: string): Promise<Table>;
        createTable(name: string, data: Record<string, unknown>[]): Promise<Table>;
        dropTable(name: string): Promise<void>;
    }

    export interface Table {
        countRows(): Promise<number>;
        add(data: Record<string, unknown>[]): Promise<void>;
        delete(predicate: string): Promise<void>;
        search(vector: number[]): Query;
        filter(predicate: string): FilterQuery;
    }

    export interface Query {
        limit(n: number): Query;
        distanceType(type: string): Query;
        toArray(): Promise<Record<string, unknown>[]>;
    }

    export interface FilterQuery {
        toArray(): Promise<Record<string, unknown>[]>;
    }
}

/** 允许导入 .wasm 二进制文件 (esbuild binary loader) */
declare module "*.wasm" {
    const content: Uint8Array;
    export default content;
}

/** Voy 向量数据库类型补充 */
declare module "voy-search/voy_search_bg.js" {
    export class Voy {
        constructor(resource?: any);
        serialize(): string;
        static deserialize(serialized: string): Voy;
        add(resource: any): void;
        search(query: Float32Array, k: number): any;
        remove(resource: any): void;
        clear(): void;
        size(): number;
    }
    export function __wbg_set_wasm(val: any): void;
}
