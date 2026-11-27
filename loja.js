/* =====================================================
   ABL IMPORTS — LOJA PÚBLICA
   Arquivo: loja.js

   - Buscar produtos e categorias no Supabase
   - Pesquisar, filtrar e ordenar produtos
   - Exibir preços à vista
   - Escolher o tamanho (ml) com preço próprio
   - Exibir descrições com negrito e quebras de linha
   - Abrir detalhes e galeria de fotos
   - Ampliar fotos com Lightbox Galerie
   - Preparar pedidos pelo WhatsApp
   - Atualizar o catálogo com Supabase Realtime
   ===================================================== */

"use strict";

/* ---------- 1. CONFIGURAÇÃO ---------- */

const WHATSAPP_NUMERO = "5531998612832";
const TEMPO_ATUALIZACAO = 350;

const CONFIG = window.ABLIMPORTS_SUPABASE_CONFIG;

let supabaseClient = null;
let produtos = [];
let categorias = [];
let categoriaSelecionada = "";

let canalRealtime = null;
let temporizadorAtualizacao = null;
let carregamentoEmAndamento = false;
let atualizacaoPendente = false;
let focoAntesDoModal = null;

/* ---------- LIGHTBOX ---------- */

let lightbox = null;
let lightboxImagem = null;
let lightboxContador = null;

let fotosGaleriaAtual = [];
let indiceFotoAtual = 0;
let inicioToqueLightbox = 0;

/* ---------- 2. ELEMENTOS DA PÁGINA ---------- */

const elementos = {
  busca: document.getElementById("productSearch"),
  ordenacao: document.getElementById("productSort"),
  filtros: document.getElementById("categoryFilters"),
  grade: document.getElementById("productGrid"),
  mensagem: document.getElementById("catalogMessage"),
  contador: document.getElementById("productCount"),
  vazio: document.getElementById("emptyState"),
  limparFiltros: document.getElementById("clearFilters"),
  ano: document.getElementById("currentYear"),
  contatoWhatsApp: document.getElementById("contactWhatsApp"),
  cabecalhoWhatsApp: document.getElementById("headerWhatsApp")
};

const modal = {
  raiz: document.getElementById("productModal"),
  fundo: document.getElementById("modalBackdrop"),
  dialogo: document.getElementById("modalDialog"),
  fechar: document.getElementById("modalClose"),
  miniaturas: document.getElementById("modalThumbs"),
  principal: document.getElementById("modalMainImage"),
  categoria: document.getElementById("modalCategoria"),
  nome: document.getElementById("modalNome"),
  preco: document.getElementById("modalPreco"),
  descricao: document.getElementById("modalDescricao"),
  whatsapp: document.getElementById("modalWhatsApp"),
  variacoes: document.getElementById("modalVariacoes")
};

/* ---------- 3. INICIALIZAÇÃO ---------- */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarLoja, {
    once: true
  });
} else {
  iniciarLoja();
}

async function iniciarLoja() {
  configurarAno();
  configurarWhatsApp();
  configurarLightbox();
  configurarEventos();

  if (!validarConfiguracao()) {
    mostrarMensagem(
      "Não foi possível conectar ao catálogo. Verifique a configuração do Supabase."
    );
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(
      CONFIG.url,
      CONFIG.publishableKey
    );

    await carregarCatalogo();
    configurarRealtime();
  } catch (erro) {
    console.error("Erro ao iniciar a loja:", erro);

    mostrarMensagem(
      "Não foi possível carregar o catálogo. Tente novamente em instantes."
    );
  }
}

/* ---------- 4. VALIDAR CONFIGURAÇÃO ---------- */

function validarConfiguracao() {
  if (!CONFIG) {
    console.error(
      "Configuração não encontrada. Verifique o arquivo supabase-config.js."
    );
    return false;
  }

  if (!CONFIG.url || !CONFIG.publishableKey) {
    console.error(
      "A URL ou a chave pública do Supabase não foi configurada."
    );
    return false;
  }

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error("A biblioteca do Supabase não foi carregada.");
    return false;
  }

  if (!CONFIG.tables?.products || !CONFIG.tables?.categories) {
    console.error(
      "Os nomes das tabelas de produtos e categorias não foram configurados."
    );
    return false;
  }

  return true;
}

/* ---------- 5. CONFIGURAÇÕES DA PÁGINA ---------- */

function configurarAno() {
  if (elementos.ano) {
    elementos.ano.textContent = new Date().getFullYear();
  }
}

function obterNumeroWhatsApp() {
  let numero = String(WHATSAPP_NUMERO || "").replace(/\D/g, "");

  if (!numero) {
    return "";
  }

  if (numero.length === 10 || numero.length === 11) {
    numero = `55${numero}`;
  }

  if (
    numero.length < 12 ||
    numero.length > 13 ||
    !numero.startsWith("55")
  ) {
    console.warn(
      "Confira o número do WhatsApp. Use código do país + DDD + telefone."
    );

    return "";
  }

  return numero;
}

function configurarWhatsApp() {
  const numero = obterNumeroWhatsApp();

  if (!numero) {
    const links = [
      elementos.contatoWhatsApp,
      elementos.cabecalhoWhatsApp
    ];

    for (const link of links) {
      if (!link) continue;

      link.href = "#contato";
      link.removeAttribute("target");
      link.setAttribute("aria-disabled", "true");

      link.title =
        "Confira o número de WhatsApp no arquivo loja.js.";
    }

    return;
  }

  const mensagemGeral = encodeURIComponent(
    "Olá! Conheci a ABL IMPORTS pelo catálogo e gostaria de mais informações."
  );

  const linkGeral =
    `https://wa.me/${numero}?text=${mensagemGeral}`;

  const links = [
    elementos.contatoWhatsApp,
    elementos.cabecalhoWhatsApp
  ];

  for (const link of links) {
    if (!link) continue;

    link.href = linkGeral;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.removeAttribute("aria-disabled");
    link.removeAttribute("title");
  }
}

/* ---------- 6. EVENTOS ---------- */

function configurarEventos() {
  elementos.busca?.addEventListener(
    "input",
    renderizarProdutos
  );

  elementos.ordenacao?.addEventListener(
    "change",
    renderizarProdutos
  );

  elementos.limparFiltros?.addEventListener(
    "click",
    limparFiltros
  );

  document.addEventListener("keydown", evento => {
    const ativo = document.activeElement;
    const tag = ativo?.tagName;

    const digitando =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      ativo?.isContentEditable;

    if (
      evento.key === "/" &&
      !digitando &&
      !evento.ctrlKey &&
      !evento.metaKey &&
      !evento.altKey &&
      !modalEstaAberto()
    ) {
      evento.preventDefault();
      elementos.busca?.focus();
    }

    if (
      evento.key === "Escape" &&
      ativo === elementos.busca &&
      elementos.busca
    ) {
      elementos.busca.value = "";
      renderizarProdutos();
      elementos.busca.blur();
    }
  });

  modal.fechar?.addEventListener(
    "click",
    fecharProduto
  );

  modal.fundo?.addEventListener(
    "click",
    fecharProduto
  );

  document.addEventListener("keydown", evento => {
    if (lightboxEstaAberto()) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        fecharLightbox();
      }

      if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        navegarLightbox(-1);
      }

      if (evento.key === "ArrowRight") {
        evento.preventDefault();
        navegarLightbox(1);
      }

      if (evento.key === "Tab") {
        manterFocoNoLightbox(evento);
      }

      return;
    }

    if (evento.key === "Escape" && modalEstaAberto()) {
      fecharProduto();
    }

    if (evento.key === "Tab" && modalEstaAberto()) {
      manterFocoNoModal(evento);
    }
  });

  window.addEventListener("popstate", evento => {
    const id = evento.state?.produto;

    if (!id) {
      esconderProduto();
      return;
    }

    const produto = produtos.find(
      item => String(item.id) === String(id)
    );

    if (produto) {
      abrirProduto(produto, { historico: false });
    } else {
      esconderProduto();
    }
  });
}

function manterFocoNoModal(evento) {
  const itens = [
    modal.fechar,
    ...Array.from(
      modal.dialogo?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    )
  ].filter(item => {
    return (
      item &&
      !item.hidden &&
      item.getAttribute("aria-disabled") !== "true"
    );
  });

  if (itens.length === 0) {
    evento.preventDefault();
    modal.dialogo?.focus();
    return;
  }

  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];

  if (evento.shiftKey && document.activeElement === primeiro) {
    evento.preventDefault();
    ultimo.focus();
  } else if (
    !evento.shiftKey &&
    document.activeElement === ultimo
  ) {
    evento.preventDefault();
    primeiro.focus();
  }
}

function manterFocoNoLightbox(evento) {
  const botaoFechar = lightbox?.querySelector(".lightbox-close");

  const botaoAnterior = lightbox?.querySelector(".lightbox-prev");
  const botaoProximo = lightbox?.querySelector(".lightbox-next");

  const itens = [
    botaoFechar,
    botaoAnterior,
    botaoProximo
  ].filter(item => item && !item.hidden);

  if (itens.length === 0) {
    evento.preventDefault();
    botaoFechar?.focus();
    return;
  }

  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];

  if (
    evento.shiftKey &&
    document.activeElement === primeiro
  ) {
    evento.preventDefault();
    ultimo.focus();
  } else if (
    !evento.shiftKey &&
    document.activeElement === ultimo
  ) {
    evento.preventDefault();
    primeiro.focus();
  }
}

/* ---------- 7. CARREGAR CATÁLOGO ---------- */

async function carregarCatalogo() {
  if (carregamentoEmAndamento) {
    atualizacaoPendente = true;
    return;
  }

  carregamentoEmAndamento = true;
  atualizacaoPendente = false;

  const primeiraCarga = produtos.length === 0;

  if (primeiraCarga) {
    mostrarMensagem("Carregando nosso catálogo...");
  }

  try {
    const [resultadoProdutos, resultadoCategorias] =
      await Promise.all([
        supabaseClient
          .from(CONFIG.tables.products)
          .select(
            "id, nome, categoria, descricao, preco, fotos, volumes, created_at"
          )
          .order("created_at", { ascending: false }),

        supabaseClient
          .from(CONFIG.tables.categories)
          .select("nome")
          .order("nome", { ascending: true })
      ]);

    if (resultadoProdutos.error) {
      throw resultadoProdutos.error;
    }

    if (resultadoCategorias.error) {
      throw resultadoCategorias.error;
    }

    produtos = Array.isArray(resultadoProdutos.data)
      ? resultadoProdutos.data
      : [];

    categorias = Array.isArray(resultadoCategorias.data)
      ? resultadoCategorias.data
      : [];

    renderizarCategorias();
    renderizarProdutos();

    if (primeiraCarga) {
      abrirProdutoDaUrl();
    }
  } catch (erro) {
    console.error("Erro ao carregar os dados da loja:", erro);

    if (primeiraCarga) {
      mostrarMensagem(
        "Não foi possível carregar os produtos. Verifique sua conexão e as permissões de leitura do Supabase."
      );
    }
  } finally {
    carregamentoEmAndamento = false;

    if (atualizacaoPendente) {
      atualizacaoPendente = false;
      agendarAtualizacao();
    }
  }
}

/* ---------- 8. CATEGORIAS ---------- */

function obterCategoriasDisponiveis() {
  const nomes = new Map();

  for (const item of categorias) {
    const nome = String(item?.nome ?? "").trim();
    const chave = normalizarTexto(nome);

    if (chave && !nomes.has(chave)) {
      nomes.set(chave, nome);
    }
  }

  for (const produto of produtos) {
    const nome = String(produto?.categoria ?? "").trim();
    const chave = normalizarTexto(nome);

    if (chave && !nomes.has(chave)) {
      nomes.set(chave, nome);
    }
  }

  return [...nomes.values()].sort((a, b) =>
    a.localeCompare(b, "pt-BR", {
      sensitivity: "base"
    })
  );
}

function renderizarCategorias() {
  if (!elementos.filtros) {
    return;
  }

  elementos.filtros.replaceChildren();

  const botaoTodos = document.createElement("button");

  botaoTodos.type = "button";
  botaoTodos.className =
    "category-chip" +
    (categoriaSelecionada === "" ? " active" : "");

  botaoTodos.dataset.category = "";
  botaoTodos.textContent = "Todos os produtos";

  botaoTodos.setAttribute(
    "aria-pressed",
    String(categoriaSelecionada === "")
  );

  botaoTodos.addEventListener("click", () => {
    categoriaSelecionada = "";
    renderizarCategorias();
    renderizarProdutos();
  });

  elementos.filtros.appendChild(botaoTodos);

  for (const categoria of obterCategoriasDisponiveis()) {
    const ativa =
      normalizarTexto(categoriaSelecionada) ===
      normalizarTexto(categoria);

    const botao = document.createElement("button");

    botao.type = "button";
    botao.className =
      "category-chip" + (ativa ? " active" : "");

    botao.dataset.category = categoria;
    botao.textContent = categoria;

    botao.setAttribute(
      "aria-pressed",
      String(ativa)
    );

    botao.addEventListener("click", () => {
      categoriaSelecionada = ativa ? "" : categoria;

      renderizarCategorias();
      renderizarProdutos();
    });

    elementos.filtros.appendChild(botao);
  }
}

/* ---------- 9. FILTRAR E ORDENAR ---------- */

function obterProdutosFiltrados() {
  const termo = normalizarTexto(
    elementos.busca?.value ?? ""
  );

  let resultado = produtos.filter(produto => {
    const nome = normalizarTexto(produto.nome);
    const categoria = normalizarTexto(produto.categoria);
    const descricao = normalizarTexto(produto.descricao);

    const correspondeBusca =
      !termo ||
      nome.includes(termo) ||
      categoria.includes(termo) ||
      descricao.includes(termo);

    const correspondeCategoria =
      !categoriaSelecionada ||
      categoria === normalizarTexto(categoriaSelecionada);

    return correspondeBusca && correspondeCategoria;
  });

  const ordenacao =
    elementos.ordenacao?.value || "novos";

  if (ordenacao === "menor") {
    resultado.sort(
      (a, b) => obterPrecoBase(a) - obterPrecoBase(b)
    );
  } else if (ordenacao === "maior") {
    resultado.sort(
      (a, b) => obterPrecoBase(b) - obterPrecoBase(a)
    );
  } else if (ordenacao === "nome") {
    resultado.sort((a, b) =>
      String(a.nome || "").localeCompare(
        String(b.nome || ""),
        "pt-BR",
        { sensitivity: "base" }
      )
    );
  } else {
    resultado.sort((a, b) => {
      const dataA = new Date(a.created_at || 0).getTime();
      const dataB = new Date(b.created_at || 0).getTime();

      return dataB - dataA;
    });
  }

  return resultado;
}

/* ---------- 10. EXIBIR PRODUTOS ---------- */

function renderizarProdutos() {
  if (!elementos.grade) {
    return;
  }

  const resultado = obterProdutosFiltrados();

  elementos.grade.replaceChildren();

  if (elementos.mensagem) {
    elementos.mensagem.hidden = true;
  }

  if (elementos.contador) {
    elementos.contador.textContent =
      resultado.length === 1
        ? "1 produto"
        : `${resultado.length} produtos`;
  }

  if (elementos.vazio) {
    elementos.vazio.hidden = resultado.length > 0;
  }

  if (resultado.length === 0) {
    return;
  }

  const fragmento = document.createDocumentFragment();

  for (const produto of resultado) {
    fragmento.appendChild(
      criarCartaoProduto(produto)
    );
  }

  elementos.grade.appendChild(fragmento);
}

function criarCartaoProduto(produto) {
  const cartao = document.createElement("article");
  cartao.className = "product-card";

  const fotos = obterFotos(produto.fotos);

  const areaImagem = document.createElement("button");

  areaImagem.type = "button";
  areaImagem.className = "product-image-button";

  areaImagem.setAttribute(
    "aria-label",
    `Ver detalhes de ${produto.nome || "produto"}`
  );

  if (fotos.length > 0) {
    const imagem = document.createElement("img");

    imagem.className = "product-image";
    imagem.src = fotos[0];
    imagem.alt = produto.nome || "Produto ABL IMPORTS";
    imagem.loading = "lazy";
    imagem.decoding = "async";

    imagem.addEventListener(
      "error",
      () => {
        imagem.replaceWith(criarPlaceholderImagem());
      },
      { once: true }
    );

    areaImagem.appendChild(imagem);
  } else {
    areaImagem.appendChild(criarPlaceholderImagem());
  }

  areaImagem.addEventListener("click", () => {
    abrirProduto(produto);
  });

  cartao.appendChild(areaImagem);

  const conteudo = document.createElement("div");
  conteudo.className = "product-info";

  if (produto.categoria) {
    const categoria = document.createElement("span");

    categoria.className = "product-category";
    categoria.textContent = produto.categoria;

    conteudo.appendChild(categoria);
  }

  const nome = document.createElement("h3");

  nome.className = "product-name";
  nome.textContent = produto.nome || "Produto sem nome";

  conteudo.appendChild(nome);

  const preco = document.createElement("p");

  preco.className = "product-price";
  preco.textContent = obterTextoPrecoCartao(produto);

  conteudo.appendChild(preco);

  const acoes = document.createElement("div");
  acoes.className = "product-actions";

  const botaoDetalhes = document.createElement("button");

  botaoDetalhes.type = "button";
  botaoDetalhes.className = "product-details";
  botaoDetalhes.textContent = "Ver detalhes";

  botaoDetalhes.addEventListener("click", () => {
    abrirProduto(produto);
  });

  acoes.appendChild(botaoDetalhes);
  acoes.appendChild(criarBotaoWhatsApp(produto));

  conteudo.appendChild(acoes);
  cartao.appendChild(conteudo);

  return cartao;
}

function criarPlaceholderImagem() {
  const placeholder = document.createElement("div");

  placeholder.className = "product-image-placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", "Imagem indisponível");

  const texto = document.createElement("span");

  texto.textContent = "ABL IMPORTS";

  placeholder.appendChild(texto);

  return placeholder;
}

/* ---------- 11. FOTOS ---------- */

function obterFotos(fotos) {
  const lista = Array.isArray(fotos)
    ? fotos
    : [fotos];

  return lista
    .filter(
      foto =>
        typeof foto === "string" &&
        foto.trim()
    )
    .map(validarUrlImagem)
    .filter(Boolean);
}

function validarUrlImagem(valor) {
  try {
    const url = new URL(
      valor,
      window.location.href
    );

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

/* ---------- 12. PREÇOS E TAMANHOS (ML) ---------- */

function obterPreco(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0;
  }

  if (typeof valor === "string") {
    const limpo = valor
      .trim()
      .replace(/[^\d,.-]/g, "");

    if (!limpo) {
      return 0;
    }

    let normalizado = limpo;

    if (limpo.includes(",") && limpo.includes(".")) {
      if (
        limpo.lastIndexOf(",") >
        limpo.lastIndexOf(".")
      ) {
        normalizado = limpo
          .replace(/\./g, "")
          .replace(",", ".");
      } else {
        normalizado = limpo.replace(/,/g, "");
      }
    } else if (limpo.includes(",")) {
      normalizado = limpo.replace(",", ".");
    }

    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : 0;
  }

  return 0;
}

function formatarPreco(valor) {
  return obterPreco(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/*
  Lê as opções de tamanho do produto.
  Formato salvo pelo painel (coluna "volumes"):
  [{ "ml": 50, "preco": 199.9 }, { "ml": 100, "preco": 299.9 }]
  Se o tamanho não tiver preço próprio, vale o preço base.
*/
function obterVariacoes(produto) {
  let lista = produto?.volumes;

  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      lista = [];
    }
  }

  if (!Array.isArray(lista)) {
    return [];
  }

  const precoBase = obterPreco(produto?.preco);

  return lista
    .map(item => {
      const precoItem =
        item?.preco === null ||
        item?.preco === undefined ||
        item?.preco === ""
          ? precoBase
          : obterPreco(item.preco);

      return {
        ml: Number(String(item?.ml ?? "").replace(",", ".")),
        preco: precoItem
      };
    })
    .filter(item => Number.isFinite(item.ml) && item.ml > 0)
    .sort((a, b) => a.ml - b.ml);
}

function obterPrecoBase(produto) {
  const variacoes = obterVariacoes(produto);

  return variacoes.length > 0
    ? Math.min(...variacoes.map(item => item.preco))
    : obterPreco(produto.preco);
}

function formatarMl(ml) {
  return `${Number(ml).toLocaleString("pt-BR")} ml`;
}

function obterTextoPrecoCartao(produto) {
  const variacoes = obterVariacoes(produto);

  if (variacoes.length > 1) {
    const precos = variacoes.map(item => item.preco);

    if (Math.min(...precos) !== Math.max(...precos)) {
      return `A partir de ${formatarPreco(Math.min(...precos))}`;
    }
  }

  return `${formatarPreco(obterPrecoBase(produto))} à vista`;
}

/* ---------- 13. WHATSAPP ---------- */

function obterLinkWhatsAppProduto(produto, variacao = null) {
  const numero = obterNumeroWhatsApp();

  if (!numero) {
    return "";
  }

  const preco = variacao
    ? variacao.preco
    : obterPrecoBase(produto);

  const mensagem = encodeURIComponent(
    `Olá! Tenho interesse neste produto da ABL IMPORTS:\n\n` +
    `Produto: ${produto.nome || "produto"}\n` +
    (variacao ? `Tamanho: ${formatarMl(variacao.ml)}\n` : "") +
    `Preço: ${formatarPreco(preco)} à vista\n\n` +
    `Poderia me dar mais informações?`
  );

  return `https://wa.me/${numero}?text=${mensagem}`;
}

function criarBotaoWhatsApp(produto) {
  const variacoes = obterVariacoes(produto);

  /* Com mais de uma opção, o cliente escolhe o tamanho no modal. */
  if (variacoes.length > 1) {
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "product-whatsapp";
    botao.textContent = "Escolher tamanho";

    botao.addEventListener("click", () => {
      abrirProduto(produto);
    });

    return botao;
  }

  const botao = document.createElement("a");

  botao.className = "product-whatsapp";

  const link = obterLinkWhatsAppProduto(
    produto,
    variacoes[0] || null
  );

  if (!link) {
    botao.href = "#contato";
    botao.setAttribute("aria-disabled", "true");

    botao.title =
      "Confira o número de WhatsApp no arquivo loja.js.";
  } else {
    botao.href = link;
    botao.target = "_blank";
    botao.rel = "noopener noreferrer";
  }

  const icone = document.createElement("span");

  icone.setAttribute("aria-hidden", "true");
  icone.textContent = "↗";

  const texto = document.createElement("span");

  texto.textContent = "Tenho interesse";

  botao.append(icone, texto);

  return botao;
}

/* ---------- 14. DETALHES DO PRODUTO ---------- */

function modalEstaAberto() {
  return Boolean(modal.raiz) && !modal.raiz.hidden;
}

function atualizarOpcaoModal(produto, variacao) {
  if (modal.preco) {
    const preco = variacao
      ? variacao.preco
      : obterPrecoBase(produto);

    modal.preco.textContent =
      `${formatarPreco(preco)} à vista`;
  }

  if (!modal.whatsapp) {
    return;
  }

  const link = obterLinkWhatsAppProduto(produto, variacao);

  if (link) {
    modal.whatsapp.href = link;
    modal.whatsapp.target = "_blank";
    modal.whatsapp.rel = "noopener noreferrer";

    modal.whatsapp.removeAttribute("aria-disabled");
  } else {
    modal.whatsapp.href = "#contato";

    modal.whatsapp.removeAttribute("target");
    modal.whatsapp.setAttribute("aria-disabled", "true");
  }
}

function renderizarVariacoes(produto) {
  if (!modal.variacoes) {
    atualizarOpcaoModal(produto, null);
    return;
  }

  const variacoes = obterVariacoes(produto);

  modal.variacoes.replaceChildren();
  modal.variacoes.hidden = variacoes.length === 0;

  if (variacoes.length === 0) {
    atualizarOpcaoModal(produto, null);
    return;
  }

  const rotulo = document.createElement("span");

  rotulo.className = "modal-variants-label";
  rotulo.textContent = "Escolha o tamanho";

  const lista = document.createElement("div");

  lista.className = "modal-variants-list";
  lista.setAttribute("role", "group");
  lista.setAttribute("aria-label", "Opções de tamanho");

  const botoes = [];

  const selecionar = (variacao, botaoAtivo) => {
    for (const botao of botoes) {
      const ativo = botao === botaoAtivo;

      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    }

    atualizarOpcaoModal(produto, variacao);
  };

  for (const variacao of variacoes) {
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "variant-button";

    const ml = document.createElement("span");

    ml.textContent = formatarMl(variacao.ml);

    const preco = document.createElement("small");

    preco.textContent = formatarPreco(variacao.preco);

    botao.append(ml, preco);

    botao.addEventListener("click", () => {
      selecionar(variacao, botao);
    });

    botoes.push(botao);
    lista.appendChild(botao);
  }

  modal.variacoes.append(rotulo, lista);

  selecionar(variacoes[0], botoes[0]);
}

function renderizarGaleria(produto, fotos) {
  if (!modal.principal || !modal.miniaturas) {
    return;
  }

  fotosGaleriaAtual = [...fotos];
  indiceFotoAtual = 0;

  modal.principal.replaceChildren();
  modal.miniaturas.replaceChildren();

  if (fotos.length === 0) {
    modal.principal.appendChild(
      criarPlaceholderImagem()
    );

    modal.miniaturas.hidden = true;
    return;
  }

  const imagemPrincipal = document.createElement("img");

  imagemPrincipal.className = "modal-image";
  imagemPrincipal.src = fotos[0];
  imagemPrincipal.alt =
    `Foto de ${produto.nome || "produto"}`;

  imagemPrincipal.style.cursor = "zoom-in";

  imagemPrincipal.addEventListener("click", () => {
    abrirLightbox(indiceFotoAtual);
  });

  imagemPrincipal.addEventListener(
    "error",
    () => {
      imagemPrincipal.replaceWith(
        criarPlaceholderImagem()
      );
    },
    { once: true }
  );

  modal.principal.appendChild(imagemPrincipal);

  modal.miniaturas.hidden = fotos.length < 2;

  fotos.forEach((url, indice) => {
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className =
      "modal-thumb" + (indice === 0 ? " active" : "");

    botao.setAttribute(
      "aria-label",
      `Ver foto ${indice + 1}`
    );

    const miniatura = document.createElement("img");

    miniatura.src = url;
    miniatura.alt = "";
    miniatura.loading = "lazy";

    miniatura.addEventListener(
      "error",
      () => {
        botao.hidden = true;
      },
      { once: true }
    );

    botao.appendChild(miniatura);

    botao.addEventListener("click", () => {
      indiceFotoAtual = indice;
      imagemPrincipal.src = url;

      for (const item of modal.miniaturas.children) {
        item.classList.toggle(
          "active",
          item === botao
        );
      }
    });

    modal.miniaturas.appendChild(botao);
  });
}

/* ---------- 15. LIGHTBOX GALERIE ---------- */

function configurarLightbox() {
  if (lightbox) {
    return;
  }

  lightbox = document.createElement("div");

  lightbox.className = "product-lightbox";
  lightbox.hidden = true;

  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Galeria de imagens");

  const imagemContainer = document.createElement("div");

  imagemContainer.className = "lightbox-image-container";

  lightboxImagem = document.createElement("img");

  lightboxImagem.className = "lightbox-image";
  lightboxImagem.alt = "";

  const botaoFechar = document.createElement("button");

  botaoFechar.type = "button";
  botaoFechar.className = "lightbox-close";
  botaoFechar.setAttribute("aria-label", "Fechar galeria");
  botaoFechar.textContent = "×";

  const botaoAnterior = document.createElement("button");

  botaoAnterior.type = "button";
  botaoAnterior.className = "lightbox-arrow lightbox-prev";
  botaoAnterior.setAttribute("aria-label", "Foto anterior");
  botaoAnterior.textContent = "‹";

  const botaoProximo = document.createElement("button");

  botaoProximo.type = "button";
  botaoProximo.className = "lightbox-arrow lightbox-next";
  botaoProximo.setAttribute("aria-label", "Próxima foto");
  botaoProximo.textContent = "›";

  lightboxContador = document.createElement("span");

  lightboxContador.className = "lightbox-counter";
  lightboxContador.setAttribute("aria-live", "polite");

  imagemContainer.appendChild(lightboxImagem);

  lightbox.append(
    imagemContainer,
    botaoFechar,
    botaoAnterior,
    botaoProximo,
    lightboxContador
  );

  document.body.appendChild(lightbox);

  botaoFechar.addEventListener("click", fecharLightbox);

  botaoAnterior.addEventListener("click", () => {
    navegarLightbox(-1);
  });

  botaoProximo.addEventListener("click", () => {
    navegarLightbox(1);
  });

  lightbox.addEventListener("click", evento => {
    if (evento.target === lightbox) {
      fecharLightbox();
    }
  });

  lightbox.addEventListener(
    "touchstart",
    evento => {
      inicioToqueLightbox =
        evento.changedTouches[0]?.clientX || 0;
    },
    { passive: true }
  );

  lightbox.addEventListener(
    "touchend",
    evento => {
      const fim =
        evento.changedTouches[0]?.clientX || 0;

      const distancia = fim - inicioToqueLightbox;

      if (Math.abs(distancia) < 50) {
        return;
      }

      navegarLightbox(distancia > 0 ? -1 : 1);
    },
    { passive: true }
  );
}

function lightboxEstaAberto() {
  return Boolean(lightbox) && !lightbox.hidden;
}

function abrirLightbox(indice = 0) {
  if (
    !lightbox ||
    fotosGaleriaAtual.length === 0
  ) {
    return;
  }

  indiceFotoAtual = Math.max(
    0,
    Math.min(indice, fotosGaleriaAtual.length - 1)
  );

  atualizarLightbox();

  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");

  lightbox.querySelector(".lightbox-close")?.focus();
}

function fecharLightbox() {
  if (!lightboxEstaAberto()) {
    return;
  }

  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");

  const imagemPrincipal =
    modal.principal?.querySelector(".modal-image");

  if (imagemPrincipal) {
    imagemPrincipal.focus();
  } else {
    modal.fechar?.focus();
  }
}

function atualizarLightbox() {
  if (
    !lightboxImagem ||
    fotosGaleriaAtual.length === 0
  ) {
    return;
  }

  const foto = fotosGaleriaAtual[indiceFotoAtual];

  lightboxImagem.src = foto;
  lightboxImagem.alt =
    `Foto ${indiceFotoAtual + 1} de ${fotosGaleriaAtual.length}`;

  lightboxContador.textContent =
    `${indiceFotoAtual + 1} / ${fotosGaleriaAtual.length}`;

  const imagemPrincipal =
    modal.principal?.querySelector(".modal-image");

  if (imagemPrincipal) {
    imagemPrincipal.src = foto;
  }

  const miniaturas = modal.miniaturas?.children || [];

  Array.from(miniaturas).forEach((botao, indice) => {
    botao.classList.toggle(
      "active",
      indice === indiceFotoAtual
    );
  });

  const anterior = lightbox.querySelector(".lightbox-prev");
  const proximo = lightbox.querySelector(".lightbox-next");

  const mostrarSetas = fotosGaleriaAtual.length > 1;

  anterior.hidden = !mostrarSetas;
  proximo.hidden = !mostrarSetas;
}

function navegarLightbox(direcao) {
  if (
    !lightboxEstaAberto() ||
    fotosGaleriaAtual.length < 2
  ) {
    return;
  }

  indiceFotoAtual =
    (indiceFotoAtual + direcao + fotosGaleriaAtual.length) %
    fotosGaleriaAtual.length;

  atualizarLightbox();
}

/* ---------- 16. ABRIR E FECHAR PRODUTO ---------- */

function abrirProduto(
  produto,
  { historico = true } = {}
) {
  if (!modal.raiz || !produto) {
    return;
  }

  if (!modalEstaAberto()) {
    focoAntesDoModal = document.activeElement;
  }

  if (lightboxEstaAberto()) {
    fecharLightbox();
  }

  if (modal.categoria) {
    modal.categoria.textContent =
      produto.categoria || "";

    modal.categoria.hidden = !produto.categoria;
  }

  if (modal.nome) {
    modal.nome.textContent =
      produto.nome || "Produto sem nome";
  }

  if (modal.descricao) {
    renderizarDescricao(
      modal.descricao,
      produto.descricao ||
        "Este produto ainda não possui descrição."
    );
  }

  renderizarGaleria(
    produto,
    obterFotos(produto.fotos)
  );

  /* Mostra as opções de ml e define preço e link do WhatsApp. */
  renderizarVariacoes(produto);

  modal.raiz.hidden = false;
  document.body.classList.add("modal-open");

  if (modal.dialogo) {
    modal.dialogo.scrollTop = 0;
  }

  modal.fechar?.focus();

  if (historico) {
    history.pushState(
      { produto: String(produto.id) },
      "",
      `#produto-${encodeURIComponent(produto.id)}`
    );
  }
}

function esconderProduto() {
  if (lightboxEstaAberto()) {
    fecharLightbox();
  }

  if (!modalEstaAberto()) {
    return;
  }

  modal.raiz.hidden = true;
  document.body.classList.remove("modal-open");

  fotosGaleriaAtual = [];
  indiceFotoAtual = 0;

  if (
    focoAntesDoModal &&
    typeof focoAntesDoModal.focus === "function"
  ) {
    focoAntesDoModal.focus();
  }
}

function fecharProduto() {
  if (!modalEstaAberto()) {
    return;
  }

  if (history.state?.produto) {
    history.back();
    return;
  }

  history.replaceState(
    null,
    "",
    location.pathname + location.search
  );

  esconderProduto();
}

function abrirProdutoDaUrl() {
  const encontrado = location.hash.match(
    /^#produto-(.+)$/
  );

  if (!encontrado) {
    return;
  }

  let id;

  try {
    id = decodeURIComponent(encontrado[1]);
  } catch {
    return;
  }

  const produto = produtos.find(
    item => String(item.id) === id
  );

  if (produto) {
    abrirProduto(produto, {
      historico: false
    });
  }
}

/* ---------- 17. ESTADOS DA INTERFACE ---------- */

function mostrarMensagem(mensagem) {
  if (elementos.mensagem) {
    elementos.mensagem.hidden = false;
    elementos.mensagem.replaceChildren();

    const texto = document.createElement("p");

    texto.textContent = mensagem;

    elementos.mensagem.appendChild(texto);
  }

  if (elementos.grade) {
    elementos.grade.replaceChildren();
  }

  if (elementos.vazio) {
    elementos.vazio.hidden = true;
  }

  if (elementos.contador) {
    elementos.contador.textContent = "Catálogo";
  }
}

function limparFiltros() {
  if (elementos.busca) {
    elementos.busca.value = "";
  }

  if (elementos.ordenacao) {
    elementos.ordenacao.value = "novos";
  }

  categoriaSelecionada = "";

  renderizarCategorias();
  renderizarProdutos();
}

/* ---------- 18. NORMALIZAÇÃO DE TEXTO ---------- */

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/* ---------- 19. FORMATAÇÃO DA DESCRIÇÃO ---------- */

/*
  Escreva *texto* para exibir o trecho em negrito.

  Exemplo:
  *Destaques*
  Bateria de longa duração.
  *Armazenamento:* 256 GB.

  As quebras de linha são preservadas.
  O texto não é interpretado como HTML.
*/

function renderizarDescricao(elemento, valor) {
  if (!elemento) {
    return;
  }

  elemento.replaceChildren();

  const linhas = String(valor ?? "").split(/\r?\n/);

  linhas.forEach((linha, indiceLinha) => {
    if (indiceLinha > 0) {
      elemento.appendChild(
        document.createElement("br")
      );
    }

    const partes = linha.split(/(\*[^*]+\*)/g);

    for (const parte of partes) {
      if (
        parte.startsWith("*") &&
        parte.endsWith("*") &&
        parte.length > 2
      ) {
        const negrito = document.createElement("strong");

        negrito.textContent = parte.slice(1, -1);

        elemento.appendChild(negrito);
      } else {
        elemento.appendChild(
          document.createTextNode(parte)
        );
      }
    }
  });
}

/* ---------- 20. SUPABASE REALTIME ---------- */

function configurarRealtime() {
  if (!supabaseClient) {
    return;
  }

  canalRealtime = supabaseClient
    .channel("ablimports-loja-publica")

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CONFIG.tables.products
      },
      () => {
        agendarAtualizacao();
      }
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: CONFIG.tables.categories
      },
      () => {
        agendarAtualizacao();
      }
    )

    .subscribe(status => {
      if (status === "CHANNEL_ERROR") {
        console.warn(
          "Não foi possível iniciar as atualizações em tempo real. " +
          "Confira a configuração do Supabase Realtime."
        );
      }
    });
}

function agendarAtualizacao() {
  if (temporizadorAtualizacao) {
    clearTimeout(temporizadorAtualizacao);
  }

  temporizadorAtualizacao = setTimeout(() => {
    temporizadorAtualizacao = null;
    carregarCatalogo();
  }, TEMPO_ATUALIZACAO);
}

/* ---------- 21. LIMPEZA AO SAIR ---------- */

window.addEventListener("pagehide", () => {
  if (temporizadorAtualizacao) {
    clearTimeout(temporizadorAtualizacao);
    temporizadorAtualizacao = null;
  }

  if (canalRealtime && supabaseClient) {
    supabaseClient.removeChannel(canalRealtime);
    canalRealtime = null;
  }
});
