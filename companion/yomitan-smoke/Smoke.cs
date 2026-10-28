// Tests the real renderer and extension; sends only to the local mock on 18766.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using CloudmusicYomitan;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class SmokeRunner {
    static Dictionary<string,object> Context() => new Dictionary<string,object> {
        {"term","歌う"},{"sentence","私は戀人と歌う。"},{"offset",5},{"title","試験曲 — 試験歌手"},{"url","https://music.163.com/song?id=42"},
        {"segments",new [] {
            new Dictionary<string,object>{{"text","私は"},{"reading",""}},new Dictionary<string,object>{{"text","戀人"},{"reading","あなた"}},
            new Dictionary<string,object>{{"text","と"},{"reading",""}},new Dictionary<string,object>{{"text","歌う"},{"reading","うたう"}},
            new Dictionary<string,object>{{"text","。"},{"reading",""}}
        }}
    };
    static async Task Wait(CoreWebView2 core,string condition,int steps=120) {
        for(int i=0;i<steps;i++){if(await core.ExecuteScriptAsync(condition)=="true")return;await Task.Delay(500);}
        throw new Exception("Timed out: "+condition+"; page="+await core.ExecuteScriptAsync("JSON.stringify({url:location.href,loaded:document.documentElement.dataset.loaded,bridge:document.documentElement.dataset.fgBridge,title:document.title})"));
    }
    [STAThread] static void Main(string[] args) {
        if(args.Length!=4)return;
        Directory.CreateDirectory(args[0]);
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        var anchor=new Form {Text="ncm-Yotiman · 验证",Width=400,Height=100};
        anchor.Shown+=async(s,e)=>{
            var log=Path.Combine(args[0],"smoke.log");Action<string> write=text=>File.AppendAllText(log,DateTime.UtcNow.ToString("o")+" "+text+Environment.NewLine);
            write("BEGIN");
            try {
                var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(args[0],"profile"),new CoreWebView2EnvironmentOptions {AreBrowserExtensionsEnabled=true});
                using(var window=new DictionaryWindow(env,args[1],true)) {
                    await window.Open(Context());
                    var view=(WebView2)typeof(DictionaryWindow).GetField("view",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(window);
                    var core=view.CoreWebView2;
                    core.WebMessageReceived+=(x,a)=>write("MESSAGE "+a.WebMessageAsJson);
                    core.NewWindowRequested+=(x,a)=>write("NEW_WINDOW "+a.Uri+" user="+a.IsUserInitiated);
                    core.GetDevToolsProtocolEventReceiver("Runtime.exceptionThrown").DevToolsProtocolEventReceived+=(x,a)=>write("JSERROR "+a.ParameterObjectAsJson);
                    await core.CallDevToolsProtocolMethodAsync("Runtime.enable","{}");
                    core.AddWebResourceRequestedFilter("https://ncm-yotiman-test.invalid/*",CoreWebView2WebResourceContext.All);
                    core.WebResourceRequested+=(x,a)=>{if(a.Request.Uri=="https://ncm-yotiman-test.invalid/dictionary.zip")a.Response=env.CreateWebResourceResponse(File.OpenRead(args[2]),200,"OK","Content-Type: application/zip\r\nAccess-Control-Allow-Origin: *");};
                    await Wait(core,"document.documentElement.dataset.loaded==='true' && document.documentElement.dataset.fgBridge==='ready'");
                    await core.ExecuteScriptAsync(File.ReadAllText(args[3]));
                    await Wait(core,"window.__ncmSmoke==='configured'",240);
                    write("SETUP configured");
                    await window.Open(Context());
                    await Wait(core,"!!document.querySelector('[data-action=save-note]:not(:disabled)')");
                    write("LOOKUP "+await core.ExecuteScriptAsync("JSON.stringify({history:history.state,entries:document.querySelectorAll('[data-action=save-note]').length})"));
                    string wav=Path.Combine(args[0],"synthetic.wav");var bytes=new byte[844];
                    Array.Copy(System.Text.Encoding.ASCII.GetBytes("RIFF"),bytes,4);BitConverter.GetBytes(836).CopyTo(bytes,4);Array.Copy(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "),0,bytes,8,8);BitConverter.GetBytes(16).CopyTo(bytes,16);BitConverter.GetBytes((short)1).CopyTo(bytes,20);BitConverter.GetBytes((short)1).CopyTo(bytes,22);BitConverter.GetBytes(8000).CopyTo(bytes,24);BitConverter.GetBytes(16000).CopyTo(bytes,28);BitConverter.GetBytes((short)2).CopyTo(bytes,32);BitConverter.GetBytes((short)16).CopyTo(bytes,34);Array.Copy(System.Text.Encoding.ASCII.GetBytes("data"),0,bytes,36,4);BitConverter.GetBytes(800).CopyTo(bytes,40);File.WriteAllBytes(wav,bytes);
                    typeof(DictionaryWindow).GetField("audioPath",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(window,wav);
                    await core.ExecuteScriptAsync("document.querySelector('[data-action=save-note]').click()");await Task.Delay(7000);
                    using(var image=File.Create(Path.Combine(args[0],"lookup-render.png")))await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
                    write("DONE");
                }
            }catch(Exception error){write("FAIL "+error);}
            anchor.Close();
        };
        Application.Run(anchor);
    }
}
