$('#importFiles').onclick=()=>$('#noteFileImport').click();
$('#noteFileImport').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  if(files.length>200||files.reduce((sum,f)=>sum+f.size,0)>20*1024*1024)return toast('每次最多 200 个文件、20 MB');
  const wrapped=files.map(f=>({name:f.name,webkitRelativePath:'导入/'+f.name.replace(/\.(txt|markdown)$/i,'.md'),size:f.size,arrayBuffer:()=>f.arrayBuffer()}));
  try{showImportPlan(await planFolderImport(wrapped))}catch(err){toast('文件分析失败：'+err.message)}
};
