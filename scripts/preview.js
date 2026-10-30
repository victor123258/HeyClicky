const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../src/renderer');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'};
http.createServer((req,res)=>{
  let url;
  try { url=decodeURIComponent(new URL(req.url,'http://preview').pathname); } catch {res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);});
}).listen(3000,'0.0.0.0',()=>console.log('UI preview on port 3000. Desktop features require Windows.'));
