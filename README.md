# gss

Gospod Spletna Stran is a very simple javascript templating engine that i use for some of my projects.

## usage

```bash
node gss.js # output in ./docs
```

or

```js
import gss from "gss.js";

gss.render("profile.html", { user: ... });
```

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

then on init or on first render itll check thru all the files and load the data and ready the components.
afterwards every page or component is given the loaded data files and any additional parameters as globals accessed either thru the filename or the `p` object. components can be rendered thru the `c` object.

## syntax

```c
{{ expr }} // returns the given expression as escaped html
{{{ expr }}} // the same but doesnt escape html

<script &> stmt; stmt; return expr; </script> // escapes html and allows for multiple statements, requires a return at the end tho
<script &&> stmt; stmt; return expr; </script>// same but doesnt escape html
```
