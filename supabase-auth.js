
/* =====================================================
   ABL IMPORTS — CONFIGURAÇÃO SUPABASE
   ===================================================== */

(() => {
  "use strict";

  window.ABLIMPORTS_SUPABASE_CONFIG = Object.freeze({
    url: "https://zsmmjuxxbrtbahiyshrt.supabase.co",

    publishableKey:
      "sb_publishable_9BeJtsCDoJsQ5HnCFDpKDg_lshy12eI",

    storageBucket: "ablimports-produtos",

    tables: Object.freeze({
      products: "ablimports_products",
      categories: "ablimports_categories",
      admins: "ablimports_admins"
    })
  });
})();
