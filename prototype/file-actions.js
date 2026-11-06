(() => {
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('文件已生成，请确认浏览器下载完成');
  }
  function menu(trigger, heading, choices) {
    const dialog = document.createElement('dialog'); dialog.className = 'file-dialog';
    const h = document.createElement('h2'); h.textContent = heading;
    const close = document.createElement('button'); close.textContent = '关闭'; close.className = 'file-close'; close.onclick = () => dialog.close();
    const header = document.createElement('header'); header.append(h, close); dialog.append(header);
    for (const [name, detail, action, disabled] of choices) {
      const b = document.createElement('button'); b.className = 'file-choice'; b.disabled = !!disabled;
      const strong = document.createElement('strong'); strong.textContent = name;
      const small = document.createElement('small'); small.textContent = detail;
      b.append(strong, small); b.onclick = () => { dialog.close(); action(); }; dialog.append(b);
    }
    dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); });
    dialog.addEventListener('click', e => { if(e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close(); } });
    document.body.append(dialog); dialog.showModal();
  }
  // ZIP STORE entries with UTF-8 names and CRC32; works offline without dependencies.
  function zipNotes(items) {
    const encoder = new TextEncoder(), chunks = [], directory = []; let offset = 0, dirSize = 0;
    const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; };
    const safePath = path => path.split('/').map(p => {
      let s = p.replace(/[<>:"\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/g,'_');
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)) s='_'+s;
      return s || '_';
    }).join('/');
    const used = new Set();
    for (const note of items) {
      let path=safePath(note.path), n=1; const original=path;
      while(used.has(path.toLowerCase()))path=original.slice(0,-3)+'-'+(n++)+'.md';
      used.add(path.toLowerCase());
      const name=encoder.encode(path), data=note.bytes||encoder.encode(note.body), crc=crc32(data);
      const local=new Uint8Array(30+name.length), l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true); l.setUint16(12,33,true);
      l.setUint32(14,crc,true); l.setUint32(18,data.length,true); l.setUint32(22,data.length,true); l.setUint16(26,name.length,true); local.set(name,30);
      const central=new Uint8Array(46+name.length), c=new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);
      c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
      chunks.push(local,data);directory.push(central);offset+=local.length+data.length;dirSize+=central.length;
    }
    const end=new Uint8Array(22), e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,items.length,true);e.setUint16(10,items.length,true);e.setUint32(12,dirSize,true);e.setUint32(16,offset,true);
    return new Blob([...chunks,...directory,end],{type:'application/zip'});
  }
  $('#backup').onclick = () => menu($('#backup'), '备份与恢复', [
    ['导出备份','保存全部笔记、图片、标签和回收站，供以后恢复。',exportBackup],
    ['导入备份','从 JSON 文件恢复；确认后替换当前资料库。',()=>$('#backupFile').click()]
  ]);
  $('#exportNotes').onclick = () => menu($('#exportNotes'), '导出笔记', [
    ['当前笔记 · Markdown','仅导出正文；含图片时请选择全部笔记 ZIP。',()=>download(new Blob([current.body],{type:'text/markdown;charset=utf-8'}),current.path.split('/').pop()),!current],
    ['全部笔记 · ZIP','包含导入的图片和文件夹结构，不包含回收站和标签；特殊文件名会转换。',()=>download(zipNotes([...notes,...Object.entries(assets).map(([path,data])=>({path,bytes:Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))}))]),'Markdown笔记.zip'),!notes.length]
  ]);
})();
