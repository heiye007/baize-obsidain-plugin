<script lang="ts">
    export let app;
</script>

<div class="baize-mobile-layout" data-app-version={app.version}>
    <h1>白泽 Baize (Mobile)</h1>
    <p>移动端抽屉布局正在开发中...</p>
</div>

<style>
    .baize-mobile-layout {
        padding: 1rem;
        padding-bottom: env(safe-area-inset-bottom);
        display: flex;
        flex-direction: column;
        height: 100%;
    }
</style>
