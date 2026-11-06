// Shares the prototype's in-memory notebook; no network or library required.
(() => {
  const button = document.createElement('button');
  button.textContent = '关联图谱';
  document.querySelector('.topbar nav').insertBefore(button, document.querySelector('.actions-menu'));
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '关联笔记可视化图谱');
  dialog.className = 'graph-dialog';
  dialog.innerHTML = '<header style="display:flex;justify-content:space-between"><h2>关联笔记图谱</h2><button id="graphClose">关闭</button></header><p>箭头表示引用方向 · 紫灰色为当前笔记 · 虚线为未创建目标 · 点击节点打开笔记</p><label>范围 <select id="graphScope"><option value="all">全部笔记</option><option value="local">当前笔记及直接关联</option></select></label><label> 搜索路径 <input id="graphSearch" style="width:240px" placeholder="输入路径关键词"></label><p id="graphStatus" role="status"></p><div id="graphCanvas" style="overflow:auto"></div>';
  document.body.append(dialog);
  const ns = 'http://www.w3.org/2000/svg';
  function element(name, attrs, text) {
    const el = document.createElementNS(ns, name);
    for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function render() {
    if (!dialog.open) return;
    const nodes = new Map(notes.map(n => [n.path,{path:n.path,exists:true}]));
    const edges = [];
    for (const note of notes) {
      const targets = new Set([...note.body.matchAll(/\[\[([^\]\r\n]+)\]\]/g)].map(m => m[1]+'.md'));
      for (const target of targets) {
        if (!nodes.has(target)) nodes.set(target,{path:target,exists:false});
        edges.push({source:note.path,target});
      }
    }
    const local = new Set(current ? [current.path] : []);
    edges.forEach(e => {if(e.source===current?.path)local.add(e.target);if(e.target===current?.path)local.add(e.source)});
    const query = dialog.querySelector('#graphSearch').value.trim().toLowerCase();
    const visible = [...nodes.values()].filter(n => (dialog.querySelector('#graphScope').value==='all'||local.has(n.path))&&n.path.toLowerCase().includes(query));
    const allowed = new Set(visible.map(n=>n.path));
    const links = edges.filter(e=>allowed.has(e.source)&&allowed.has(e.target));
    dialog.querySelector('#graphStatus').textContent = `${visible.length} 个节点 · ${links.length} 条引用 · ${visible.filter(n=>!n.exists).length} 个未创建目标${visible.length?'':' · 暂无匹配笔记'}`;
    const size = Math.max(680,visible.length*65), center=size/2, radius=size*.34;
    const svg=element('svg',{viewBox:`0 0 ${size} ${size}`,width:'100%',style:'min-width:600px;max-height:65vh',role:'group','aria-label':'笔记引用关系'});
    const defs=element('defs',{}),marker=element('marker',{id:'graphArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
    marker.append(element('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#9695A4'}));defs.append(marker);svg.append(defs);
    visible.forEach((n,i)=>{const a=i*2*Math.PI/visible.length-Math.PI/2;n.x=center+radius*Math.cos(a);n.y=center+radius*Math.sin(a)});
    const positions=new Map(visible.map(n=>[n.path,n]));
    links.forEach(e=>{const a=positions.get(e.source),b=positions.get(e.target),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;svg.append(element('path',{d:a===b?`M ${a.x-12} ${a.y-15} C ${a.x-65} ${a.y-80},${a.x+65} ${a.y-80},${a.x+12} ${a.y-20}`:`M ${a.x+dx/len*23} ${a.y+dy/len*23} L ${b.x-dx/len*27} ${b.y-dy/len*27}`,fill:'none',stroke:'#9695A4','stroke-width':2,'marker-end':'url(#graphArrow)'}))});
    visible.forEach(n=>{const g=element('g',{tabindex:0,role:'button','aria-label':n.path+(n.exists?'，打开笔记':'，目标尚未创建'),style:'cursor:pointer'});g.append(element('title',{},n.path));g.append(element('circle',{cx:n.x,cy:n.y,r:21,fill:n.path===current?.path?'#756A91':'var(--panel)',stroke:n.exists?'#789':'#AD4050','stroke-width':3,'stroke-dasharray':n.exists?'':'5 4'}));g.append(element('text',{x:n.x,y:n.y+42,'text-anchor':'middle',fill:'var(--ink)','font-size':14},n.path.length>26?n.path.slice(0,23)+'…':n.path));const activate=()=>{if(!n.exists){toast('目标尚未创建：'+n.path);return}openNote(n.path);dialog.close();button.focus()};g.onclick=activate;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}};svg.append(g)});
    dialog.querySelector('#graphCanvas').replaceChildren(svg);
  }
  button.onclick=()=>{dialog.showModal();render()};
  dialog.querySelector('#graphClose').onclick=()=>dialog.close();
  dialog.querySelector('#graphSearch').oninput=render;
  dialog.querySelector('#graphScope').onchange=render;
})();
