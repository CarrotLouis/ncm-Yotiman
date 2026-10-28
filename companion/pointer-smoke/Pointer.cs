// Real browser-input regressions for CEF's differing event and caret support.
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
internal sealed class PointerRunner : Form {
    readonly WebView2 view=new WebView2 {Dock=DockStyle.Fill};readonly string output,src;
    readonly JavaScriptSerializer json=new JavaScriptSerializer();
    [STAThread]static void Main(string[] args){Application.EnableVisualStyles();Application.Run(new PointerRunner(args[0],args[1]));}
    PointerRunner(string directory,string source){output=directory;src=source;Text="ncm-Yotiman · CEF 拖选验证";Width=900;Height=300;Controls.Add(view);Shown+=async(s,e)=>await Run();}
    async Task Input(string method,object value)=>await view.CoreWebView2.CallDevToolsProtocolMethodAsync("Input."+method,json.Serialize(value));
    async Task RunCase(string mode){
        bool old=mode=="old-pointer-only",mouseOnly=old||mode=="mouse-only",unknown=mode=="annotated-native-line";
        string dictionary=File.ReadAllText(Path.Combine(src,"dictionary.js"));
        if(old)dictionary=dictionary.Replace("[['pointerdown',down],['pointermove',move],['pointerup',up],['mousedown',down],['mousemove',move],['mouseup',up],['click',click]]","[['pointerdown',down],['pointermove',move],['pointerup',up],['click',click]]");
        string host=mouseOnly?"const add=window.addEventListener.bind(window);window.addEventListener=(type,...args)=>{if(!type.startsWith('pointer'))return add(type,...args);};":"window.addEventListener('pointerdown',e=>e.preventDefault(),true);";
        if(mode=="no-caret-api")host+="document.caretRangeFromPoint=()=>null;document.caretPositionFromPoint=()=>null;";
        string className=unknown?"native-current-line-hash":"rnp-lyrics-line-original";
        string mark=unknown?"const line=document.querySelector('.native-current-line-hash');line.__fgText='私は戀人と歌う。';line.__fgHosts=[];":"";
        string fixture="<!doctype html><meta charset=utf-8><style>body{padding:50px;font-size:42px}body *{user-select:none!important;-webkit-user-select:none!important}rt{font-size:18px}del{display:none}</style><div class='"+className+"'><span class='fg-line'>私は<span class='fg-ruby'><ruby>戀人<rt class='fg-rt'><span class='fg-reading'>あなた</span><del>こいびと</del></rt></ruby></span>と歌う。</span></div><script>"+host+"document.addEventListener('selectstart',e=>e.preventDefault());"+mark+"</script><script>"+File.ReadAllText(Path.Combine(src,"selection.js"))+"</script><script>"+dictionary+"</script><script>window.lookups=[];window.adapter=NcmYotimanDictionary.install({config:()=>({dictionaryEnabled:true}),subscribe:()=>()=>{},set(){},track:()=>({id:'42',title:'Synthetic'}),transport:{send:async(action,context)=>{if(action==='lookup')lookups.push(context);}}});window.ready=true;</script>";
        await view.CoreWebView2.ExecuteScriptAsync("window.ready=false");view.CoreWebView2.NavigateToString(fixture);
        bool ready=false;for(int i=0;i<60;i++){if(await view.CoreWebView2.ExecuteScriptAsync("window.ready===true")=="true"){ready=true;break;}await Task.Delay(100);}if(!ready)throw new Exception("Fixture failed to load: "+mode);
        string raw=json.Deserialize<string>(await view.CoreWebView2.ExecuteScriptAsync("(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('ruby').firstChild);const b=r.getBoundingClientRect();return JSON.stringify({x:b.left+.1,end:b.right-.1,y:(b.top+b.bottom)/2});})()"));
        var box=json.Deserialize<Dictionary<string,double>>(raw);double x=box["x"],end=box["end"],y=box["y"];
        await Input("dispatchKeyEvent",new {type="keyDown",key="Shift",code="ShiftLeft",windowsVirtualKeyCode=16,modifiers=8});
        await Input("dispatchMouseEvent",new {type="mouseMoved",x,y,modifiers=8});
        await Input("dispatchMouseEvent",new {type="mousePressed",x,y,button="left",buttons=1,clickCount=1,modifiers=8});
        for(int i=1;i<=8;i++)await Input("dispatchMouseEvent",new {type="mouseMoved",x=x+(end-x)*i/8,y,button="left",buttons=1,modifiers=8});
        await Input("dispatchMouseEvent",new {type="mouseReleased",x=end,y,button="left",buttons=0,clickCount=1,modifiers=8});
        await Input("dispatchKeyEvent",new {type="keyUp",key="Shift",code="ShiftLeft",windowsVirtualKeyCode=16,modifiers=0});await Task.Delay(300);
        string result=json.Deserialize<string>(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({count:lookups.length,term:lookups[0]?.term,reading:lookups[0]?.segments.find(s=>s.text==='戀人')?.reading,diagnostics:adapter.diagnostics()})"));
        File.AppendAllText(Path.Combine(output,"pointer.log"),mode+" "+result+Environment.NewLine);
        var parsed=json.Deserialize<Dictionary<string,object>>(result);int count=Convert.ToInt32(parsed["count"]);
        if(old&&count!=0)throw new Exception("Old pointer-only path should reproduce missing CEF input");
        if(!old&&(count!=1||parsed["term"].ToString()!="戀人"||parsed["reading"].ToString()!="あなた"))throw new Exception("Drag failed: "+mode);
    }
    async Task Run(){Directory.CreateDirectory(output);try{var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(output,"profile"));await view.EnsureCoreWebView2Async(env);foreach(string mode in new[]{"old-pointer-only","mouse-only","blocked-native-selection","no-caret-api","annotated-native-line"})await RunCase(mode);File.AppendAllText(Path.Combine(output,"pointer.log"),"PASS"+Environment.NewLine);}catch(Exception e){File.AppendAllText(Path.Combine(output,"pointer.log"),"FAIL "+e+Environment.NewLine);}Close();}
}
