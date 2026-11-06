const STORAGE_KEY='markdown-notes-library-v1';
const UI_KEY='markdown-notes-ui-v1';
let initialUI={},restoringUI=true;
try{const saved=JSON.parse(localStorage.getItem(UI_KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))initialUI=saved}catch{}
function saveUI(){
 if(restoringUI)return;
 const state={theme:document.body.classList.contains('dark')?'dark':'light',currentPath:current?.path||null,folder,tag,
  search:$('#search').value,view:$('#editorGrid').classList.contains('edit')?'edit':'preview',
  details:$('#details').classList.contains('open'),noteListScroll:$('.note-panel').scrollTop,editorScroll:$('#editorGrid').scrollTop};
 try{localStorage.setItem(UI_KEY,JSON.stringify(state))}catch{toast('界面设置未保存，请检查浏览器存储空间')}
}
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const samples=[{path:'数据结构/栈与队列.md',body:'# 栈与队列\n\n线性结构的两种基本形态，区别在于元素取出的顺序。\n\n## 栈 · 后进先出\n\n- 入栈：将元素放到栈顶\n- 出栈：取出栈顶元素\n\n## 队列 · 先进先出\n\n- 入队：从队尾加入元素\n- 出队：从队首取出元素\n\n关联：[[数据结构/表达式求值]]',tags:['复习','重点']},{path:'数据结构/表达式求值.md',body:'# 表达式求值\n\n使用 [[数据结构/栈与队列]] 中的栈结构处理运算符优先级。',tags:['复习']},{path:'软件工程/需求追溯.md',body:'# 需求追溯\n\n将每条需求连接到设计、实现与测试，便于检查变更影响。',tags:['重点']}];
const notes=[];let trash=[],current=null,folder='',tag='',lastFocused=null,storageBlocked=false,storedSnapshot=null;
function title(n){return n.path.split('/').pop().replace(/\.md$/,'')}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function validPath(p){return typeof p==='string'&&p.length<=500&&p.endsWith('.md')&&p.slice(0,-3).length>0&&!/[\\\x00-\x1f]/.test(p)&&p.split('/').every(v=>v.trim()===v&&v&&v!=='.'&&v!=='..')}
function validate(data){
  if(!data||data.version!==1||!Array.isArray(data.notes)||!Array.isArray(data.trash))throw Error('备份格式或版本不支持');
  if(data.notes.length+data.trash.length>10000)throw Error('笔记数量超过 10000 篇');
  const clean=list=>{const seen=new Set();return list.map(n=>{if(!n||!validPath(n.path)||typeof n.body!=='string'||!Array.isArray(n.tags)||n.tags.length>20||n.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>100)||seen.has(n.path))throw Error('笔记字段无效或路径重复');seen.add(n.path);return {path:n.path,body:n.body,tags:[...new Set(n.tags)]}})};
  return {assets:validateAssets(data.assets),notes:clean(data.notes),trash:clean(data.trash),currentPath:typeof data.currentPath==='string'?data.currentPath:null};
}
function snapshot(){return JSON.stringify({version:1,notes,trash,assets,currentPath:current?.path||null})}
let pendingSave=null,unsaved=false;
function saveFeedback(state,message){
 $('#saveState').dataset.state=state;$('#saveState').textContent=message;
 $('#saveRecovery').hidden=state!=='error';
}
function savedFeedback(){saveFeedback('saved','已保存 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})+' · 此浏览器')}
function scheduleSave(){unsaved=true;clearTimeout(pendingSave);saveFeedback('saving','保存中…');pendingSave=setTimeout(persist,450)}
function persist(){
 clearTimeout(pendingSave);pendingSave=null;
 if(storageBlocked){unsaved=true;saveFeedback('error','保存失败：存储冲突或不可用，请导出备份');return false}
 try{const previous=localStorage.getItem(STORAGE_KEY);if(previous!==storedSnapshot){storageBlocked=true;throw Error('其他页面已修改资料库，请导出当前内容后刷新')}
 const value=snapshot();localStorage.setItem(STORAGE_KEY,value);storedSnapshot=value;unsaved=false;savedFeedback();return true;
 }catch(e){unsaved=true;saveFeedback('error',e.name==='QuotaExceededError'?'保存失败：浏览器空间不足':'保存失败：'+e.message);return false}
}
$('#saveBackup').onclick=()=>exportBackup();
$('#retrySave').onclick=()=>persist();
window.addEventListener('pagehide',()=>{if(unsaved)persist()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&unsaved)persist()});
window.addEventListener('beforeunload',e=>{if(unsaved&&!persist()){e.preventDefault();e.returnValue=''}});
function targets(body){return [...new Set([...body.matchAll(/\[\[([^\]\r\n]+)\]\]/g)].map(m=>m[1]+'.md'))]}
function basicInlineMarkdown(raw){return esc(raw).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/\[\[([^\]\r\n]+)\]\]/g,(_,path)=>`<a href="#" data-link="${path}.md" title="Ctrl + 点击打开笔记">${path}</a>`)}
function inlineMarkdown(raw){return renderImageInline(raw,basicInlineMarkdown)}
function renderMarkdown(text){
 const lines=text.replace(/\r\n/g,'\n').split('\n'),parts=[];let inList=false,inCode=false,code=[];
 const closeList=()=>{if(inList){parts.push('</ul>');inList=false}};
 for(const line of lines){
  if(line.startsWith('```')){closeList();if(inCode){parts.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');code=[];inCode=false}else inCode=true;continue}
  if(inCode){code.push(line);continue}
  const item=line.match(/^[-*] (.*)$/);
  if(item){if(!inList){parts.push('<ul>');inList=true}parts.push('<li>'+inlineMarkdown(item[1])+'</li>');continue}
  closeList();
  if(line.startsWith('### '))parts.push('<h3>'+inlineMarkdown(line.slice(4))+'</h3>');
  else if(line.startsWith('## '))parts.push('<h2>'+inlineMarkdown(line.slice(3))+'</h2>');
  else if(line.startsWith('# '))parts.push('<h1>'+inlineMarkdown(line.slice(2))+'</h1>');
  else if(line.startsWith('> '))parts.push('<blockquote>'+inlineMarkdown(line.slice(2))+'</blockquote>');
  else if(line.trim())parts.push('<p>'+inlineMarkdown(line)+'</p>');
 }
 closeList();if(inCode)parts.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');
 return parts.join('');
}
function markdownFromPreview(){
 const inline=node=>{if(node.nodeType===Node.TEXT_NODE)return node.textContent;if(node.nodeType!==Node.ELEMENT_NODE)return '';const tag=node.tagName;
  if(node.dataset.markdownImage)return node.dataset.markdownImage;if(tag==='BR')return '\n';if(tag==='A'&&node.dataset.link)return '[['+node.dataset.link.replace(/\.md$/,'')+']]';
  const inner=[...node.childNodes].map(inline).join('');if(tag==='STRONG'||tag==='B')return '**'+inner+'**';if(tag==='EM'||tag==='I')return '*'+inner+'*';if(tag==='CODE')return '`'+inner+'`';return inner};
 const block=node=>{const tag=node.tagName;if(tag==='UL')return [...node.children].map(li=>'- '+[...li.childNodes].map(inline).join('')).join('\n');
  if(tag==='OL')return [...node.children].map((li,i)=>(i+1)+'. '+[...li.childNodes].map(inline).join('')).join('\n');
  if(tag==='PRE')return '```\n'+node.textContent.replace(/\n$/,'')+'\n```';
  const value=[...node.childNodes].map(inline).join('');if(tag==='H1')return '# '+value;if(tag==='H2')return '## '+value;if(tag==='H3')return '### '+value;if(tag==='BLOCKQUOTE')return '> '+value;return value};
 return [...$('#preview').childNodes].map(node=>node.nodeType===Node.TEXT_NODE?node.textContent:block(node)).join('\n\n').replace(/\n{3,}/g,'\n\n');
}
function filters(){
 const folders=[...new Set(notes.flatMap(n=>{const parts=n.path.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/')+'/')}))].sort();
 const tags=[...new Set(notes.flatMap(n=>n.tags))].sort();
 if(folder&&!folders.includes(folder))folder='';if(tag&&!tags.includes(tag))tag='';
 const build=(host,values,selected,cls,all,choose)=>{host.replaceChildren();['',...values].forEach(value=>{const b=document.createElement('button');b.className=cls+(value===selected?' active':'');b.textContent=value||all;b.onclick=()=>{choose(value);refresh();if(cls==='folder')$('#folderMenu').open=false;saveUI()};host.append(b)})};
 build($('#folderList'),folders,folder,'folder','全部笔记',v=>folder=v);$('#activeFolder').textContent=folder?folder.replace(/\/$/,''):'全部笔记';build($('.filter-row'),tags,tag,'tag-filter','全部标签',v=>tag=v);
}
function refresh(){filters();const q=$('#search').value.trim().toLowerCase();const list=notes.filter(n=>(!folder||n.path.startsWith(folder))&&(!tag||n.tags.includes(tag))&&(!q||(n.path+' '+n.body).toLowerCase().includes(q)));
 $('#noteList').innerHTML=list.map(n=>`<button class="note-card ${n===current?'selected':''}" data-path="${esc(n.path)}"><strong>${esc(title(n))}</strong><small>${esc(n.path)}</small></button>`).join('')||'<p>没有匹配结果，可新建笔记或清除筛选。</p>';
 $$('.note-card').forEach(b=>b.onclick=()=>openNote(b.dataset.path));$('#trashCount').textContent=trash.length;
 ['#editor','#tags','#deleteNote','#renameNote'].forEach(id=>$(id).disabled=!current);
 $('#restoreNote').disabled=false;
}
function preview(){ $('#preview').dataset.path=current?.path||'';$('#preview').innerHTML=current?renderMarkdown(current.body):'<p>暂无笔记。点击“新建笔记”或从文件夹菜单导入本地笔记。</p>';$('#preview').contentEditable=!!current;
 $('#backlinks').innerHTML=current?(notes.filter(n=>n!==current&&targets(n.body).includes(current.path)).map(n=>`<button class="backlink" data-path="${esc(n.path)}">${esc(title(n))}</button>`).join('')||'<p>暂无反向链接</p>'):'<p>暂无反向链接</p>';
 $$('[data-link],.backlink').forEach(a=>{const path=a.dataset.link||a.dataset.path;const exists=notes.some(n=>n.path===path);a.classList.toggle('missing',!exists);a.onclick=e=>{e.preventDefault();if(a.closest('#preview')&&!e.ctrlKey&&!e.metaKey)return;exists?openNote(path):toast('目标不存在：'+path)}});
}
function openNote(path){current=notes.find(n=>n.path===path)||null;$('#editor').value=current?.body||'';$('#tags').value=current?.tags.join(', ')||'';setView('preview');preview();refresh();$('#editorGrid').scrollTop=0;saveUI()}
function commit(){preview();refresh();scheduleSave()}
$('#backHome').href=location.pathname.replace(/\\/g,'/').includes('/website/prototype/')?'../index.html':'../website/index.html';
$('#editor').oninput=()=>{if(!current)return;current.body=$('#editor').value;commit()};
$('#preview').addEventListener('input',()=>{if(!current)return;current.body=markdownFromPreview();$('#editor').value=current.body;refresh();scheduleSave()});
$('#preview').addEventListener('blur',()=>{if(current&&$('#editorGrid').classList.contains('preview'))preview()});
$('#preview').addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'))});
$('#newNote').onclick=()=>{const name=prompt('输入笔记路径，使用 / 创建文件夹',(folder||'课程/')+'新笔记');if(!name)return;const path=name.trim().endsWith('.md')?name.trim():name.trim()+'.md';if(!validPath(path))return toast('路径无效，请使用 文件夹/笔记名');if(notes.some(n=>n.path===path))return toast('该路径已存在');notes.unshift({path,body:'# '+title({path})+'\n',tags:[]});folder='';tag='';$('#search').value='';openNote(path);persist()};
$('#renameNote').onclick=()=>{if(!current)return;const name=prompt('修改路径以重命名或移动笔记',current.path);if(!name)return;const path=name.trim().endsWith('.md')?name.trim():name.trim()+'.md';if(!validPath(path))return toast('路径无效');if(notes.some(n=>n!==current&&n.path===path))return toast('该路径已存在');const old=current.path.slice(0,-3),next=path.slice(0,-3);notes.forEach(n=>n.body=n.body.split('[['+old+']]').join('[['+next+']]'));current.body=relocateImageLinks(current.body,current.path,path);current.path=path;folder='';openNote(path);persist()};
$('#deleteNote').onclick=()=>{if(!current||!confirm('将 '+current.path+' 移入回收站？'))return;if(trash.some(n=>n.path===current.path))return toast('回收站已有同名笔记，请先重命名当前笔记后再删除');trash.push(current);notes.splice(notes.indexOf(current),1);openNote(notes[0]?.path);persist()};
function changeTrashItem(item,remove){
 const index=trash.indexOf(item);if(index<0)return false;
 if(remove&&!confirm('永久删除 '+item.path+'？此操作无法撤销。'))return false;
 let path=item.path;
 if(!remove&&notes.some(n=>n.path.toLowerCase()===path.toLowerCase())){
  const name=prompt('同名笔记已存在，请输入恢复后的路径',path.replace(/\.md$/,'-恢复.md'));if(!name)return false;
  path=name.endsWith('.md')?name:name+'.md';if(!validPath(path)||notes.some(n=>n.path.toLowerCase()===path.toLowerCase())){toast('路径无效或已存在');return false}
 }
 const restored={...item,path};trash.splice(index,1);if(!remove)notes.unshift(restored);
 if(!persist()){trash.splice(index,0,item);if(!remove)notes.splice(notes.indexOf(restored),1);toast('保存失败，操作已撤回');return false}
 refresh();return true;
}
$('#restoreNote').onclick=()=>{
 const dialog=document.createElement('dialog');dialog.className='file-dialog import-dialog';dialog.setAttribute('aria-label','回收站');
 const heading=document.createElement('h2');heading.textContent='回收站';dialog.append(heading);
 const list=document.createElement('div');list.className='import-rows';dialog.append(list);
 const preview=document.createElement('pre');preview.style.cssText='white-space:pre-wrap;max-height:180px;overflow:auto';dialog.append(preview);
 const actions=document.createElement('div');dialog.append(actions);
 const restore=document.createElement('button');restore.textContent='恢复选中文件';const remove=document.createElement('button');remove.textContent='永久删除选中文件';const close=document.createElement('button');close.textContent='关闭';actions.append(restore,remove,close);
 let selected=null;
 function draw(){list.replaceChildren();preview.textContent='';selected=null;restore.disabled=remove.disabled=true;
 if(!trash.length){list.textContent='回收站为空';return}
 for(const item of trash){const button=document.createElement('button');button.className='file-choice';button.textContent=item.path;button.onclick=()=>{selected=item;preview.textContent=item.body;restore.disabled=remove.disabled=false;[...list.children].forEach(b=>b.classList.toggle('active',b===button))};list.append(button)}
 }
 restore.onclick=()=>{if(selected&&changeTrashItem(selected,false))draw()};remove.onclick=()=>{if(selected&&changeTrashItem(selected,true))draw()};close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();$('#restoreNote').focus()});draw();document.body.append(dialog);dialog.showModal();
};
$('#tags').oninput=()=>{if(!current)return;const tags=[...new Set($('#tags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean))];if(tags.length>20||tags.some(t=>t.length>100))return toast('最多 20 个标签，每个不超过 100 字');current.tags=tags;refresh();scheduleSave();saveUI()};
function exportBackup(){const blob=new Blob([JSON.stringify({...JSON.parse(snapshot()),exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='笔记备份-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已生成备份，请确认浏览器下载完成')}
$('#backup').onclick=exportBackup;

$('#backupFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('备份文件不能超过 20 MB');const data=validate(JSON.parse(await file.text()));if(!confirm(`恢复 ${data.notes.length} 篇笔记和 ${data.trash.length} 篇回收站笔记？将替换当前资料库，请先导出需要保留的内容。`))return;
 const value=JSON.stringify({version:1,...data});if(localStorage.getItem(STORAGE_KEY)!==storedSnapshot)throw Error('其他页面已修改资料库，请刷新后重试');localStorage.setItem(STORAGE_KEY,value);storedSnapshot=value;storageBlocked=false;notes.splice(0,notes.length,...data.notes);trash=data.trash;assets=data.assets||{};clearTimeout(pendingSave);unsaved=false;folder='';tag='';$('#search').value='';openNote(data.currentPath||notes[0]?.path);savedFeedback();toast('备份恢复成功');}catch(err){toast('恢复失败，原资料库未替换：'+err.message)}};
$('#theme').onclick=()=>{document.body.classList.toggle('dark');$('#theme').textContent=document.body.classList.contains('dark')?'浅色':'深色';saveUI()};
$('#importFolder').onclick=()=>$('#folderImport').click();
$('#folderImport').onchange=importFolderSelection;
$('#search').oninput=()=>{refresh();saveUI()};$('#detailsToggle').onclick=()=>openDetails();$('#closeDetails').onclick=()=>closeDetails();
try{storedSnapshot=localStorage.getItem(STORAGE_KEY);const data=storedSnapshot===null?{notes:samples,trash:[]}:validate(JSON.parse(storedSnapshot));notes.push(...data.notes);trash=data.trash;assets=data.assets||{};current=notes.find(n=>n.path===initialUI.currentPath)||notes.find(n=>n.path===data.currentPath)||notes[0]||null;folder=typeof initialUI.folder==='string'?initialUI.folder:'';tag=typeof initialUI.tag==='string'?initialUI.tag:'';$('#search').value=typeof initialUI.search==='string'?initialUI.search:'';if(initialUI.theme==='dark'){document.body.classList.add('dark');$('#theme').textContent='浅色'}}catch(e){storageBlocked=true;toast('本地数据无法读取，未覆盖原数据。可导入有效备份恢复。')}
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY||e.key===null){storageBlocked=true;saveFeedback('error','其他页面已修改，请导出后刷新')}});

function openDetails(){hideContextMenu();lastFocused=document.activeElement;$('#details').classList.add('open');$('#details').setAttribute('aria-hidden','false');$('#detailsToggle').setAttribute('aria-expanded','true');$('#details').focus();saveUI()}
function closeDetails(){if(!$('#details').classList.contains('open'))return;$('#details').classList.remove('open');$('#details').setAttribute('aria-hidden','true');$('#detailsToggle').setAttribute('aria-expanded','false');lastFocused?.focus?.();saveUI()}
function showContextMenu(event){event.preventDefault();const menu=$('#contextMenu');menu.hidden=false;const width=210,height=126;menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-height-8))+'px';menu.querySelector('button').focus()}
function hideContextMenu(){$('#contextMenu').hidden=true}
function insertWikiLink(){if(!current)return toast('请先新建笔记');setView('edit');const editor=$('#editor'),text='[[笔记路径]]',start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText(text,start,end,'select');editor.dispatchEvent(new Event('input'));editor.focus();toast('已插入双链格式')}
async function copyPath(){if(!current)return toast('请先新建笔记');try{await navigator.clipboard.writeText(current.path);toast('已复制笔记路径')}catch{const helper=document.createElement('textarea');helper.value=current.path;document.body.append(helper);helper.select();document.execCommand('copy');helper.remove();toast('已复制笔记路径')}}
function setView(view){$$('.tab').forEach(button=>button.classList.toggle('active',button.dataset.view===view));$('#editorGrid').className='editor-grid '+view;if(view==='preview'&&current)preview();saveUI()}
$$('.tab').forEach(button=>button.onclick=()=>setView(button.dataset.view));
$('#editorGrid').addEventListener('contextmenu',showContextMenu);
$('#noteList').addEventListener('contextmenu',event=>{const card=event.target.closest('.note-card');if(card)openNote(card.dataset.path);showContextMenu(event)});
$('#contextMenu').addEventListener('click',event=>{const action=event.target.dataset.action;if(action==='details')openDetails();if(action==='insert-link'){hideContextMenu();insertWikiLink()}if(action==='copy-path'){hideContextMenu();copyPath()}});
document.addEventListener('pointerdown',event=>{if(!$('#contextMenu').hidden&&!$('#contextMenu').contains(event.target))hideContextMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideContextMenu();closeDetails()}if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))showContextMenu({preventDefault:()=>event.preventDefault(),clientX:window.innerWidth/2,clientY:110})});

openNote(current?.path);
if(initialUI.view==='edit')setView('edit');
if(initialUI.details)openDetails();
requestAnimationFrame(()=>{
 $('.note-panel').scrollTop=Number.isFinite(initialUI.noteListScroll)?initialUI.noteListScroll:0;
 $('#editorGrid').scrollTop=Number.isFinite(initialUI.editorScroll)?initialUI.editorScroll:0;
 restoringUI=false;saveUI();
});
let scrollTimer;
for(const pane of [$('.note-panel'),$('#editorGrid')])pane.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveUI,120)},{passive:true});
if(!storageBlocked)persist();else saveFeedback('error','数据读取失败，请恢复备份');
