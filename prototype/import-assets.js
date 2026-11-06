// Local image attachments are included in the same atomic library snapshot.
let assets = {};
function imageReferences(body) {
  const refs=[]; let fenced=false, offset=0;
  for(const line of body.split('\n')) {
    if(/^\s*(```|~~~)/.test(line))fenced=!fenced;
    else if(!fenced) {
      const clean=line.replace(/`[^`]*`/g,m=>' '.repeat(m.length));
      for(const m of clean.matchAll(/!\[([^\]]*)\]\(\s*(<[^>]+>|(?:[^\s()]|\([^)]*\))+)\s*(?:"[^"]*")?\s*\)/g))
        refs.push({raw:m[0],alt:m[1],url:m[2].replace(/^<|>$/g,''),start:offset+m.index});
    }
    offset+=line.length+1;
  }
  return refs;
}
function resolveImagePath(notePath,url) {
  let decoded;try{decoded=decodeURIComponent(url)}catch{return null}
  if(/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(decoded))return null;
  const parts=notePath.split('/').slice(0,-1);
  for(const part of decoded.replace(/\\/g,'/').split('/')) {
    if(part==='..'){if(parts.length===0)return null;parts.pop()}
    else if(part&&part!=='.')parts.push(part);
  }
  return parts.join('/');
}
function assetAt(path, collection=assets){if(!path)return null;const key=Object.keys(collection).find(p=>p.toLowerCase()===path.toLowerCase());return key?collection[key]:null}
function validateAssets(value) {
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10000)throw Error('图片附件格式无效');
  const result={};
  for(const [path,data] of Object.entries(value)) {
    if(!path.includes('/')||path.split('/').some(p=>!p||p==='..'||p==='.')||/[\\\x00-\x1f]/.test(path)||typeof data!=='string'||!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('图片附件格式无效');
    result[path]=data;
  }
  return result;
}
function renderImageInline(raw, renderText) {
  let result='',offset=0;
  for(const ref of imageReferences(raw)) {
    result+=renderText(raw.slice(offset,ref.start));
    const data=assetAt(resolveImagePath(current?.path||'',ref.url));
    result+=`<span class="note-image" contenteditable="false" data-markdown-image="${esc(ref.raw)}">${data?`<img src="${data}" alt="${esc(ref.alt)}" loading="lazy">`:`<span class="missing">图片未导入：${esc(ref.url)}</span>`}</span>`;
    offset=ref.start+ref.raw.length;
  }
  return result+renderText(raw.slice(offset));
}
function relocateImageLinks(body,oldPath,newPath) {
  const refs=imageReferences(body).reverse();
  for(const ref of refs){const target=resolveImagePath(oldPath,ref.url);if(!target)continue;
    const from=newPath.split('/').slice(0,-1),to=target.split('/');while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift()}
    const relative=[...from.map(()=>'..'),...to].map(p=>encodeURIComponent(p)).join('/');
    body=body.slice(0,ref.start)+`![${ref.alt}](${relative})`+body.slice(ref.start+ref.raw.length);
  }return body;
}
async function planFolderImport(files) {
  const result={notes:[],assets:{},rows:[],total:files.length};
  const byPath=new Map(),used=new Set(),known=new Set(notes.map(n=>n.path.toLowerCase()));
  for(const file of files){const path=(file.webkitRelativePath||file.name).replace(/\\/g,'/');byPath.set(path.toLowerCase(),{file,path})}
  const row=(path,status,reason)=>result.rows.push({path,status,reason});
  for(const {file,path:original} of byPath.values()) {
    if(!/\.md$/i.test(original))continue; used.add(original.toLowerCase());const path=original.replace(/\.md$/i,'.md');
    if(!validPath(path)){row(original,'跳过','笔记路径无效');continue}
    if(known.has(path.toLowerCase())){row(original,'冲突','同名笔记已存在，保留原笔记');continue}
    if(file.size>1024*1024){row(original,'跳过','单篇笔记超过 1 MB');continue}
    try{const body=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());result.notes.push({path,body,tags:[]});known.add(path.toLowerCase());row(original,'导入','Markdown 笔记')}
    catch{row(original,'跳过','读取失败或不是 UTF-8 编码')}
  }
  for(const {path} of byPath.values())if(!used.has(path.toLowerCase()))row(path,'跳过',/\.(png|jpe?g|gif|webp)$/i.test(path)?'图片不导入，仅导入笔记文件':'不支持的文件类型');
  return result;
}
function showImportPlan(plan) {
  const dialog=document.createElement('dialog');dialog.className='file-dialog import-dialog';dialog.setAttribute('aria-label','确认文件夹导入');
  const h=document.createElement('h2');h.textContent='确认文件夹导入';dialog.append(h);
  const summary=document.createElement('p');summary.textContent=`已扫描 ${plan.total} 个文件 · 待导入 ${plan.notes.length} 篇笔记、${Object.keys(plan.assets).length} 张图片 · 冲突 ${plan.rows.filter(r=>r.status==='冲突').length} 项 · 跳过 ${plan.rows.filter(r=>r.status==='跳过').length} 项 · 缺失 ${plan.rows.filter(r=>r.status==='缺失').length} 项`;dialog.append(summary);
  const help=document.createElement('p');help.textContent='仅导入 Markdown 笔记，图片及其他类型会跳过。同名笔记不覆盖，保留目录结构。';dialog.append(help);
  const list=document.createElement('div');list.className='import-rows';
  for(const row of plan.rows){const item=document.createElement('p');item.textContent=`${row.status} · ${row.path} — ${row.reason}`;list.append(item)}dialog.append(list);
  const warning=document.createElement('p');warning.setAttribute('role','status');dialog.append(warning);
  const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>dialog.close();dialog.append(cancel);
  const apply=document.createElement('button');apply.textContent='确认导入';apply.className='primary';apply.disabled=!plan.notes.length;dialog.append(apply);
  apply.onclick=()=>{
    if(notes.length+trash.length+plan.notes.length>10000){warning.textContent='笔记总量超过 10000 篇，请分批整理。';return}
    if(plan.notes.some(n=>notes.some(old=>old.path.toLowerCase()===n.path.toLowerCase()))){warning.textContent='资料库发生变化，请取消后重新选择文件夹。';return}
    const oldAssets=assets;assets={...assets,...plan.assets};notes.unshift(...plan.notes);
    if(!persist()){notes.splice(0,plan.notes.length);assets=oldAssets;warning.textContent='导入未写入，原资料库保留。浏览器空间不足时请减少图片数量或先导出备份。';return}
    folder='';tag='';$('#search').value='';openNote(plan.notes[0].path);dialog.close();toast('笔记和图片已导入并保存');
  };
  dialog.addEventListener('close',()=>{dialog.remove();$('#importFolder').focus()});document.body.append(dialog);dialog.showModal();
}
async function importFolderSelection(event) {
  const files=[...event.target.files];event.target.value='';$('#folderMenu').open=false;
  if(!files.length)return;
  if(files.length>20000)return toast('文件数超过 20000，请选择较小的文件夹');
  if(files.filter(f=>/\.(md|png|jpe?g|gif|webp)$/i.test(f.name)).reduce((sum,f)=>sum+f.size,0)>20*1024*1024)return toast('所选笔记与图片超过 20 MB，请分批导入');
  $('#importFolder').disabled=true;toast('正在分析文件夹，请稍候…');
  try{showImportPlan(await planFolderImport(files))}catch(e){toast('分析失败，未导入：'+e.message)}finally{$('#importFolder').disabled=false}
}
