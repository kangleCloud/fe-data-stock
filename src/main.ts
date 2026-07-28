import { createApp } from "vue";

import App from "@/App.vue";
import { permissionDirective } from "@/directives/permission";
import router from "@/router";
import { pinia } from "@/stores";
import "@/styles/index.css";
import "@/styles/market.css";

const app = createApp(App);

app.use(pinia);
app.use(router);
app.directive("permission", permissionDirective);
app.mount("#app");
