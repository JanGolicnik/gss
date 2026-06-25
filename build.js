#!/usr/bin/env node
"use strict";
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = "src";
const DATA_DIR = path.join("src", "data");
const COMPONENTS_DIR = path.join("src", "components");
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
  dir = dir ?? COMPONENTS_DIR;
  const c = {};
  if (!fs.existsSync(dir)) return c;
  for (const f of walk_dir(dir)) {
    if (!f.endsWith(".html")) continue;
    const template = fs.readFileSync(f, "utf8");
    const name = path.basename(f, ".html");
    c[name] = (props = {}) =>
      render_str(template, {
        ...ctx,
        c,
        props,
        children: props.children ?? "",
      });
  }
  return c;
}

function load_data(dir) {
  dir = dir ?? DATA_DIR;
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

let app = null;

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

export function render(f, data) {
  const ctx = {
    ...app.data,
    ...data,
    c: app.components,
    page: path.parse(f).name,
  };
  return render_str(fs.readFileSync(f, "utf8"), ctx);
}

export function init(dir) {
  dir = dir ?? SRC_DIR;
  const data = load_data(dir);
  const components = load_components(data);
  app = {
    data,
    components,
  };
}

function build() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  init();

  for (const f of walk_dir(SRC_DIR, [DATA_DIR, COMPONENTS_DIR])) {
    if (!f.endsWith(".html")) {
      fs.copyFileSync(f, dst);
      continue;
    }
    const dst = path.join(OUT_DIR, path.relative(SRC_DIR, f));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, render(f));
  }
}

if (process.argv[1] === path.resolve(import.meta.url.slice(7))) {
  build();
}
