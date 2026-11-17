import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Ontology Studio",
  description:
    "A visual, TDD-built ontology designer — model classes, properties and relationships, validate, persist and export OWL/JSON-LD/Turtle.",
  base: "/ontology-studio/",

  head: [
    ["meta", { name: "theme-color", content: "#22d3ee" }],
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23161e2b'/%3E%3Ccircle cx='10' cy='10' r='3.5' fill='%2367e8f9'/%3E%3Ccircle cx='22' cy='10' r='3.5' fill='%23a78bfa'/%3E%3Ccircle cx='16' cy='22' r='3.5' fill='%2334d399'/%3E%3Cpath d='M10 10l6 12M22 10l-6 12M10 10h12' stroke='%2394a3b8' stroke-width='1.3'/%3E%3C/svg%3E",
      },
    ],
  ],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Architecture", link: "/architecture/" },
      { text: "ADR", link: "/adr/" },
      {
        text: "GitHub",
        link: "https://github.com/anusornc/ontology-studio",
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Templates", link: "/guide/templates" },
            { text: "Persistence", link: "/guide/persistence" },
            { text: "Development", link: "/guide/development" },
            { text: "Glossary", link: "/guide/glossary" },
          ],
        },
      ],
      "/architecture/": [
        {
          text: "Architecture",
          items: [
            { text: "Overview", link: "/architecture/" },
            { text: "Domain Contract", link: "/architecture/domain-contract" },
            { text: "API Contract", link: "/architecture/api-contract" },
            { text: "UI Contract", link: "/architecture/ui-contract" },
          ],
        },
      ],
      "/adr/": [
        {
          text: "Architecture Decisions",
          items: [
            {
              text: "0001 — pnpm Monorepo",
              link: "/adr/0001-pnpm-monorepo-with-shared-core",
            },
            {
              text: "0002 — Pure Immutable Core",
              link: "/adr/0002-pure-immutable-domain-core",
            },
            {
              text: "0003 — Contract-First Seams",
              link: "/adr/0003-contract-first-package-seams",
            },
            {
              text: "0004 — React Flow + Zustand",
              link: "/adr/0004-react-flow-canvas-and-zustand-store",
            },
            {
              text: "0005 — Fastify + JSON Persistence",
              link: "/adr/0005-fastify-rest-and-json-file-repository",
            },
            { text: "0006 — TDD Vertical Slices", link: "/adr/0006-tdd-vertical-slices" },
            {
              text: "0007 — Ontology Templates",
              link: "/adr/0007-ontology-templates",
            },
            {
              text: "0008 — SQLite Embedded Storage",
              link: "/adr/0008-sqlite-embedded-storage",
            },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/anusornc/ontology-studio" },
    ],

    footer: {
      message: "Built with TDD — 308 tests across core, server, web and E2E.",
      copyright: "© 2026 Ontology Studio Contributors",
    },

    search: { provider: "local" },
    editLink: {
      pattern:
        "https://github.com/anusornc/ontology-studio/edit/main/site/:path",
      text: "Edit this page on GitHub",
    },
    lastUpdated: { text: "Last updated" },
    outline: { level: [2, 3], label: "On this page" },
  },

  // Copied contract/ADR docs contain relative cross-references that don't
  // resolve within the VitePress site structure. Disable the check rather than
  // rewriting every link in the source documents.
  ignoreDeadLinks: true,
});
