#!/usr/bin/env node
"use strict";
import fs from "node:fs";
import path from "node:path";
import { Lexer, marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";

export default {
  init,
  render,
  render_str,
  render_component,
};

const SRC_DIR = "src";
const DATA_DIR = path.join(SRC_DIR, "data");
const COMPONENTS_DIR = path.join(SRC_DIR, "components");
const OUT_DIR = "docs";

const TOKEN_RE =
  /<markdown\s*>([\s\S]*?)<\/markdown\s*>|<script\s+&(&)?\s*>([\s\S]*?)<\/script>|\{\{\{([\s\S]*?)\}\}\}|\{\{([\s\S]*?)\}\}/g;
const ESC = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

let _app = null;
function get_app() {
  if (!_app) init();
  return _app;
}

const evaluate_cache = new Map();
function evaluate(e, ctx) {
  if (typeof e === "string") return e;

  const expr = e.expr;
  const keys = Object.keys(ctx);
  const vals = Object.values(ctx);
  const src = e.block
    ? `"use strict"; ${expr}`
    : `"use strict"; return (${expr});`;

  const key = keys.join(",") + "\0" + src;
  try {
    let fn = evaluate_cache.get(key);
    if (!fn) {
      fn = new Function(...keys, src);
      evaluate_cache.set(key, fn);
    }
    return fn(...vals);
  } catch (e) {
    console.error(`${e.message} in: ${expr.trim()}`);
    return "";
  }
}

const template_cache = new Map();
function compile_template(str) {
  const template = template_cache.get(str);
  if (template) return template;

  const out = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  while (true) {
    const m = TOKEN_RE.exec(str);
    if (!m) break;
    if (m.index > last) {
      out.push(str.slice(last, m.index));
    }
    last = TOKEN_RE.lastIndex;
    const [_, markdown, blockRaw, blockExpr, tripleExpr, doubleExpr] = m;
    if (markdown) {
      out.push({ markdown: compile_template(markdown) });
      TOKEN_RE.lastIndex = last;
      continue;
    }
    const block = blockExpr !== undefined;
    const triple = tripleExpr !== undefined;
    out.push({
      expr: block ? blockExpr : triple ? tripleExpr : doubleExpr,
      raw: block ? !!blockRaw : triple,
      block,
    });
  }
  if (last < str.length) out.push(str.slice(last));

  template_cache.set(str, out);
  return out;
}

export function render_str(str, ctx) {
  return compile_template(str)
    .map((p) =>
      p.markdown
        ? marked.parse(p.markdown.map((t) => evaluate(t, ctx)).join(""))
        : evaluate(p, ctx),
    )
    .join("");
}

export function render_component(name, data) {
  return get_app().components[name](data);
}

export function render(f, p) {
  const app = get_app();
  f = path.join(app.src_dir, f);
  const ctx = {
    ...app.data,
    p,
    c: app.components,
    page: path.parse(f).name,
  };
  return render_str(fs.readFileSync(f, "utf8"), ctx);
}

function* walk_dir(dir, filter = null) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (filter && filter.includes(p)) continue;
    if (e.isDirectory()) yield* walk_dir(p, filter);
    else yield p;
  }
}

function load_components(ctx, dir) {
  const c = {};
  if (!fs.existsSync(dir)) return c;
  for (const p of walk_dir(dir)) {
    const extension = path.extname(p);
    if (extension !== ".html" && extension !== ".md") continue;
    const template = fs.readFileSync(p, "utf8");
    const name = path.basename(p, extension);
    const dir = path.relative(COMPONENTS_DIR, p).slice(0, -extension.length);
    c[dir] = (p = {}) =>
      render_str(template, { ...ctx, c, p, escape, page: name });
  }
  return c;
}

function load_data(dir) {
  const data = { now: new Date() };
  if (!fs.existsSync(dir)) return data;
  for (const f of walk_dir(dir)) {
    if (!f.endsWith(".json")) continue;
    const p = path.relative(dir, f);
    const parts = p.split(path.sep);
    let obj = data;
    for (let i = 1; i < parts.length - 1; i++) {
      const k = parts[i];
      if (obj[k] == null) obj[k] = {};
      obj = obj[k];
    }
    obj[path.basename(f, ".json")] = JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return data;
}

function init(config) {
  const src_dir = config?.src_dir ?? SRC_DIR;
  const data_dir = config?.data_dir ?? DATA_DIR;
  const components_dir = config?.components_dir ?? COMPONENTS_DIR;
  const data = load_data(src_dir);
  const components = load_components(data, components_dir);
  _app = {
    data,
    components,
    src_dir,
    data_dir,
    components_dir,
  };
}

function build() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const app = get_app();
  const languages = app.data.languages ?? [""];
  for (const f of walk_dir(SRC_DIR, [DATA_DIR, COMPONENTS_DIR])) {
    const f2 = path.relative(SRC_DIR, f);

    if (!f.endsWith(".html")) {
      const dst = path.join(OUT_DIR, f2);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(f, dst);
      continue;
    }

    const src = fs.readFileSync(f, "utf8");
    for (const [index, language] of languages.entries()) {
      const dst = path.join(OUT_DIR, index === 0 ? "" : language, f2);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      app.data.language = language;
      const ctx = {
        ...app.data,
        c: app.components,
        page: path.parse(f).name,
        p: {}
      };
      fs.writeFileSync(dst, render_str(src, ctx));
    }
  }
}

function linkExtension() {
  return {
    renderer: {
      link({ href, _, tokens }) {
        const text = this.parser.parseInline(tokens);
        const c = href.includes("#") ? "samesite" : "";
        return `<a href="${href}" class="${c}">${text}</a>`;
      },
    },
  };
}

function sectionExtension() {
  return {
    hooks: {
      processAllTokens(tokens) {
        for (const token of tokens) {
          if (!token.text) continue;
          const i = token.text.lastIndexOf("%%");
          if (i < 0) continue;

          token.extra_id = token.text.slice(i + 2).trim();
          token.text = token.text.slice(0, i).trim();
          token.raw = token.raw.slice(0, token.raw.lastIndexOf("%%")).trim();

          if (token.tokens) {
            const lexer = new Lexer(this.options);
            token.tokens = lexer.inlineTokens(token.text);
          }
        }

        let i = 0;
        const collect = (parent = null) => {
          const out = parent ? [parent] : [];
          while (i < tokens.length) {
            const token = tokens[i];
            if (token.depth && token.depth <= (parent?.depth ?? 0)) break;
            i++;
            if (token.type !== "heading") {
              out.push(token);
              continue;
            }
            out.push({
              type: "section",
              tokens: collect(token),
              depth: token.depth,
              section_id: token.extra_id ? `h-${token.extra_id}` : undefined,
              raw: token.raw,
            });
          }
          return out;
        };
        return collect();
      },
    },
    extensions: [
      {
        name: "section",
        level: "block",
        renderer(token) {
          const tag = token.depth > 1 ? "section" : "article";
          return `<${tag} id="${token.section_id ?? ""}">${this.parser.parse(token.tokens)}</${tag}>`;
        },
      },
    ],
  };
}

function compare_html_tags(root1, root2) {
  for (const child of root1.children) {
    console.log(child);
  }
}

marked.use(sectionExtension(), linkExtension());

if (process.argv[1] === path.resolve(import.meta.url.slice(7))) {
  build();
}
