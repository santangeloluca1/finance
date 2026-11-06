/**
 * Script eseguiti nell'<head> prima dell'idratazione, per evitare il lampo di
 * tema sbagliato o di importi visibili. Modulo server-safe: niente "use client".
 */
export const THEME_KEY = "portafoglio:theme";
export const PRIVACY_KEY = "portafoglio:privacy";

export const BOOT_SCRIPT = [
  "try{",
  "var d=document.documentElement;",
  "var t=localStorage.getItem('portafoglio:theme');",
  "if(t==='light'||t==='dark'){d.dataset.theme=t}",
  "if(localStorage.getItem('portafoglio:privacy')==='on'){d.dataset.privacy='on'}",
  "if(sessionStorage.getItem('portafoglio:splash')){d.dataset.splash='off'}else{sessionStorage.setItem('portafoglio:splash','1')}",
  "}catch(e){}",
].join("");
