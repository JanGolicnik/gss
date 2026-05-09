#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

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

function render(tpl, ctx) {
  return tpl.replace(
    TOKEN_RE,
    (_, blockRaw, blockExpr, tripleExpr, doubleExpr) => {
      if (blockExpr !== undefined) {
        const out = evaluate(blockExpr, ctx, true);
        return blockRaw ? String(out) : escapeHtml(out);
      }
      if (tripleExpr !== undefined)
        return String(evaluate(tripleExpr, ctx, false));
      return escapeHtml(evaluate(doubleExpr, ctx));
    },
  );
}

function* walk_dir(dir, filter = null) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (filter && filter.includes(p)) continue;
    if (e.isDirectory()) yield* walk_dir(p, filter);
    else yield p;
  }
}

function load_components(ctx) {
  const c = {};
  if (!fs.existsSync(COMPONENTS_DIR)) return c;
  for (const f of walk_dir(COMPONENTS_DIR)) {
    if (!f.endsWith(".html")) continue;
    const template = fs.readFileSync(f, "utf8");
    const name = path.basename(f, ".html");
    c[name] = (props = {}) =>
      render(template, {
        ...ctx,
        c,
        props,
        children: props.children ?? "",
      });
  }
  return c;
}

function load_data() {
  const data = { now: new Date() };
  if (!fs.existsSync(DATA_DIR)) return data;
  for (const f of walk_dir(DATA_DIR)) {
    if (!f.endsWith(".json")) continue;
    const p = path.relative(DATA_DIR, f);
    const parts = p.split(path.sep);
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

function build() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = load_data();
  const components = load_components(data);
  for (const f of walk_dir(SRC_DIR, [DATA_DIR, COMPONENTS_DIR])) {
    const dst = path.join(OUT_DIR, path.relative(SRC_DIR, f));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (f.endsWith(".html")) {
      data.page = path.parse(f).name;
      const ctx = { ...data, c: components, page: path.parse(f).name };
      fs.writeFileSync(dst, render(fs.readFileSync(f, "utf8"), ctx));
      continue;
    }
    fs.copyFileSync(f, dst);
  }
}

build();
