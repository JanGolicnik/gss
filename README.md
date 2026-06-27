# gss

Gospod Spletna Stran is a very simple javascript templating engine that i use for some of my projects.

by default it expects a folder structure like this:

```
/src
  /components
    component1.html
    component2.html
  /data
    data1.json
    data2.json
  page1.html
  page2.html
gss.js
```

## Usage

then on init or on first render itll check thru all the files and load the data and ready the components.
afterwards every page or component is given the loaded data files and any additional parameters as globals accessed either thru the filename or the `p` object. components can be rendered thru the `c` object.

src/components/userinfo.html
```html
<p> {{ p.user.name }} </p>
```

src/data/page.json
```json
{
 title: "hello !"
}
```

src/index.html
```html
<h1> {{ page.title }} </h1>
{{ c.userinfo(p.user) }}
```

app.js
```js
import gss from "gss.js"

gss.render("index.html", {  user: { name: "gospod spletna stran"  } });
```

```js

import gss from "gss.js"

// init can be omitted and deafults will be used
gss.init({
  src_dir = ...,
  components_dir = ...,
  data_dir = ...,
});

gss.render("index.html", { status: ..., user: ...});

```

Can also be used as a standalone script by running

```bash
node gss.js # output in ./docs
```

## syntax

```c
{{ expr }} // returns the given expression as escaped html
{{{ expr }}} // the same but doesnt escape html

<script &> stmt; stmt; return expr; </script> // escapes html and allows for multiple statements, requires a return at the end tho
<script &&> stmt; stmt; return expr; </script>// same but doesnt escape html
```
