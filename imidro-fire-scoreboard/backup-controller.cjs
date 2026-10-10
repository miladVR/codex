"use strict";
function registerBackups({ipcMain,dialog,getStore,getWindow,assertAdmin}){
 ipcMain.handle('data:backup',async event=>{
  assertAdmin(event);const choice=await dialog.showSaveDialog(getWindow(),{title:'ذخیره نسخه پشتیبان',defaultPath:`imidro-fire-backup-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'JSON',extensions:['json']}]});
  if(choice.canceled||!choice.filePath)return {canceled:true};getStore().exportSnapshot(choice.filePath);return {canceled:false,filePath:choice.filePath};
 });
 ipcMain.handle('data:restore-prepare',async event=>{
  assertAdmin(event);const choice=await dialog.showOpenDialog(getWindow(),{title:'انتخاب نسخه پشتیبان برای بازیابی',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
  if(choice.canceled||!choice.filePaths?.length)return {canceled:true};return {canceled:false,...getStore().prepareRestore(choice.filePaths[0])};
 });
}
module.exports={registerBackups};
