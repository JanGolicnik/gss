#!/usr/bin/env node
"use strict";
import fs from "node:fs";
import path from "node:path";

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
  /<script\s+&(&)?\s*>([\s\S]*?)<\/script>|\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function evaluate(expr, ctx, block) {
  const keys = Object.keys(ctx);
  const vals = Object.values(ctx);
  const src = block
    ? `"use strict"; ${expr}`
    : `"use strict"; return (${expr});`;
  try {
    return new Function(...keys, src)(...vals);
  } catch (e) {
    console.error(`${e.message} in: ${expr.trim()}`);
    return "";
  }
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
  for (const f of walk_dir(dir)) {
    if (!f.endsWith(".html")) continue;
    const template = fs.readFileSync(f, "utf8");
    const name = path.basename(f, ".html");
    c[name] = (p = {}) =>
      render_str(template, {
        ...ctx,
        c,
        p,
        children: p.children ?? "",
        page: name,
      });
  }
  return c;
}

function load_data(dir) {
  const data = { now: new Date() };
  if (!fs.existsSync(dir)) return data;
  for (const f of walk_dir(dir)) {
    if (!f.endsWith(".json")) continue;
    const p = path.relative(dir, f);
    const parts = p.split(dir.sep);
    let obj = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (obj[k] == null) obj[k] = {};
      obj = obj[k];
    }
    obj[path.basename(f, ".json")] = JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return data;
}

let _app = null;
function get_app() {
  if (!_app) init();
  return _app;
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

export function render_str(str, ctx) {
  return str.replace(
    TOKEN_RE,
    (_, blockRaw, blockExpr, tripleExpr, doubleExpr) => {
      if (blockExpr !== undefined) {
        const out = evaluate(blockExpr, ctx, true);
        return blockRaw ? String(out) : escapeHtml(out);
      }
      if (tripleExpr !== undefined) {
        return String(evaluate(tripleExpr, ctx, false));
      }
      return escapeHtml(evaluate(doubleExpr, ctx));
    },
  );
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

function build() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const f of walk_dir(SRC_DIR, [DATA_DIR, COMPONENTS_DIR])) {
    const f2 = path.relative(SRC_DIR, f);
    const dst = path.join(OUT_DIR, f2);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!f.endsWith(".html")) {
      fs.copyFileSync(f, dst);
      continue;
    }
    fs.writeFileSync(dst, render(f2));
  }
}

if (process.argv[1] === path.resolve(import.meta.url.slice(7))) {
  build();
}
