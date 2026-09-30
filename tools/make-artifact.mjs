// Convert dist-single/index.html into an Artifact page body (no doctype/html/head/body
// wrapper; <title> and <style> first, then markup, then the inline module script).
import fs from 'fs';
const [src = 'dist-single/index.html', out = 'dist-single/the-bear-must-eat.html'] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>The Bear Must Eat</title>'])[0];
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0].replace(/ crossorigin/, ''));
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || ['', ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const page = [title, '<meta name="theme-color" content="#0f1a24">', ...styles, body, ...scripts].join('\n');
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB); title=${title}; styles=${styles.length}; scripts=${scripts.length}`);
