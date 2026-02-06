const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const app = express();
app.use(express.static("public"));

function encode(u){ return Buffer.from(u).toString("base64"); }
function decode(u){ return Buffer.from(u, "base64").toString(); }

async function loadPage(url, res){
  try{
    const r = await fetch(url, {
      headers:{ "User-Agent":"Mozilla/5.0 Chrome/120" }
    });

    const type = r.headers.get("content-type") || "";

    if(!type.includes("text/html")){
      res.set("content-type", type);
      r.body.pipe(res);
      return;
    }

    const html = await r.text();
    const $ = cheerio.load(html);

    $("a, img, script, link, form").each((i, el)=>{
      let attr = $(el).attr("href") ? "href" :
                 $(el).attr("src") ? "src" :
                 $(el).attr("action") ? "action" : null;
      if(!attr) return;

      const val = $(el).attr(attr);
      if(!val || val.startsWith("javascript")) return;

      const fixed = new URL(val, url).href;
      $(el).attr(attr, "/go/" + encode(fixed));
    });

    res.send($.html());
  }catch{
    res.send("Failed to load site");
  }
}

app.get("/go/:url", (req,res)=>{
  loadPage(decode(req.params.url), res);
});

app.listen(3000, ()=>console.log("Proxy running → http://localhost:3000"));
