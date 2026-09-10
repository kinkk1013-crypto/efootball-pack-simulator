const ORIGIN="https://efhub.com";
const POS="GK|CB|LB|RB|DMF|CMF|AMF|LMF|RMF|LWF|RWF|SS|CF";
function clean(s=""){return s.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim()}
async function txt(url){
 const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","accept":"text/html,application/xhtml+xml"}});
 if(!r.ok) throw new Error(String(r.status)); return r.text();
}
function links(h){
 h=h.replace(/\\u002F/g,"/").replace(/\\\//g,"/");
 return [...new Set([...h.matchAll(/\/packs\/([a-z0-9][a-z0-9-]{2,120})/gi)].map(m=>"/packs/"+m[1]))];
}
function parse(h,url){
 const title=clean((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
 const low=title.toLowerCase();
 if(!(low.includes("epic")||low.includes("show time")||low.includes("showtime"))) return null;
 const text=clean(h), players=[], seen=new Set();
 const rx=new RegExp("(\\d{2,3})\\s*("+POS+")\\s+([A-ZÀ-ž][A-Za-zÀ-ž.'’\\- ]{2,45}?)(?=\\s+\\d{2,3}\\s*(?:"+POS+")|$)","g");
 let m; while((m=rx.exec(text))){let p={ovr:+m[1],pos:m[2],name:m[3].trim()};if(!seen.has(p.name)){seen.add(p.name);players.push(p)}}
 const j=/"name"\s*:\s*"([^"]+)"[\s\S]{0,250}?"(?:overall|rating|ovr)"\s*:\s*(\d{2,3})[\s\S]{0,250}?"(?:position|pos)"\s*:\s*"([^"]+)"/g;
 while((m=j.exec(h))){let p={name:clean(m[1]),ovr:+m[2],pos:clean(m[3])};if(!seen.has(p.name)){seen.add(p.name);players.push(p)}}
 if(players.length<3)return null;
 const type=low.includes("show")?"SHOW TIME":"EPIC";
 const typeCard=type==="SHOW TIME"?"ShowTime":"Epic";
 const date=(text.match(/\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i)||["Latest"])[0];
 return {date,type,title:title.replace(/\s*\|\s*eFHUB.*$/i,""),mains:players.slice(0,3).map(p=>({...p,type:typeCard})),highlights:players.slice(3,11).map(p=>[p.name,p.pos,p.ovr])};
}
export default async function handler(req,res){
 const checkedAt=new Date().toISOString(), found=[];
 try{
  let all=[];
  for(const u of [ORIGIN+"/packs",ORIGIN+"/",ORIGIN+"/new-players"]){try{all.push(...links(await txt(u)))}catch{}}
  all=[...new Set(all)].slice(-40).reverse();
  for(const p of all){if(found.length>=3)break;try{const x=parse(await txt(ORIGIN+p),ORIGIN+p);if(x&&!found.some(y=>y.title===x.title))found.push(x)}catch{}}
 }catch{}
 res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
 res.status(200).json({packs:found,checkedAt,source:"eFHUB"});
}