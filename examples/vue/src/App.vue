<template>
  <main>
    <h1>PDF Search — Vue example</h1>
    <p class="lede">
      A Vite + Vue 3 SPA wrapping a small Search island. The
      <code>/searchIndex.json</code> is generated at build time by <code>build-index.mjs</code>.
    </p>
    <Search />
  </main>
</template>

<script setup lang="ts">
import Search from './Search.vue';
</script>

<style>
body {
  font:
    16px/1.5 system-ui,
    sans-serif;
  margin: 0;
  background: #f7f7f7;
}
main {
  max-width: 720px;
  margin: 2rem auto;
  padding: 1.5rem 1rem;
  background: #fff;
  border-radius: 6px;
}
h1 {
  font-size: 1.5rem;
  margin: 0 0 0.25rem;
}
p.lede {
  color: #555;
  margin-top: 0;
}
</style>
