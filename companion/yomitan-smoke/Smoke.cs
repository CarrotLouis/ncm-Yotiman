// Tests the real renderer and extension; sends only to the local mock on 18766.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Diagnostics;
using CloudmusicYomitan;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class SmokeRunner {
    static Dictionary<string,object> Context() => new Dictionary<string,object> {
        {"term","歌う"},{"sentence","私は戀人と歌う。"},{"offset",5},{"title","試験曲 — 試験歌手"},{"url","https://music.163.com/song?id=42"},{"matchMode","longest-in-range"},
        {"translation","我与你歌唱。"},{"songTitle","試験曲"},{"songArtist","試験歌手"},
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
                    var startup=Stopwatch.StartNew();await window.Warmup("light");write("WARMUP_MS "+startup.ElapsedMilliseconds);if(window.Visible)throw new Exception("Prewarm showed a window");
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
                    int navigations=0;core.NavigationStarting+=(x,a)=>navigations++;
                    foreach(string selected in new[]{"成り果てる","魔物に成り果てる","に成り果てる","成り"}){
                        const string sentence="彼は魔物に成り果てる。";int at=sentence.IndexOf(selected,StringComparison.Ordinal);
                        var range=new Dictionary<string,object>{{"term",selected},{"sentence",sentence},{"offset",at},{"title","Synthetic"},{"url","https://music.163.com/song?id=42"},{"matchMode","longest-in-range"}};
                        anchor.Activate();await Task.Delay(100);startup.Restart();await window.Open(range,anchor.Handle);
                        if(WindowPolicy.GetForegroundWindow()!=anchor.Handle)throw new Exception("Real dictionary lookup stole the next Shift from the lyric window");
                        string match=Json.Encode(window.LastMatch);write("RANGE "+selected+" "+match+" MS "+startup.ElapsedMilliseconds);
                        var matched=Json.Read(match);int offset=Convert.ToInt32(matched["offset"]),length=Convert.ToInt32(matched["length"]);
                        if(offset<at||offset+length>at+selected.Length)throw new Exception("Dictionary match escaped the selected range");
                        if(selected!="成り"&&(Json.Text(matched,"text")!="成り果てる"||offset!=5))throw new Exception("Did not choose the longest inner word");
                        if(await core.ExecuteScriptAsync("history.state.state.sentence.offset==="+offset)!="true")throw new Exception("Anki sentence offset did not follow the match");
                        if(selected=="魔物に成り果てる"){
                            await Wait(core,"!!document.querySelector('[data-action=save-note]:not(:disabled)')");
                            await core.ExecuteScriptAsync("document.querySelector('[data-action=save-note]').click()");await Task.Delay(1500);
                            write("RANGE_NOTE requested");
                        }
                    }
                    anchor.Activate();await Task.Delay(100);startup.Restart();await window.Open(Context(),anchor.Handle);write("FIRST_LOOKUP_MS "+startup.ElapsedMilliseconds);
                    var next=Context();next["term"]="歌";next["theme"]="light";anchor.Activate();await Task.Delay(100);startup.Restart();await window.Open(next,anchor.Handle);write("NEXT_LOOKUP_MS "+startup.ElapsedMilliseconds);if(navigations!=0)throw new Exception("A lookup reloaded the search page");
                    await Wait(core,"document.documentElement.dataset.theme==='light'");using(var image=File.Create(Path.Combine(args[0],"lookup-light.png")))await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
                    anchor.Activate();await Task.Delay(100);var dark=Context();dark["theme"]="dark";await window.Open(dark,anchor.Handle);await Wait(core,"document.documentElement.dataset.theme==='dark'");
                    anchor.Activate();await Task.Delay(100);startup.Restart();await window.Open(dark,anchor.Handle);write("SAME_LOOKUP_MS "+startup.ElapsedMilliseconds);if(startup.ElapsedMilliseconds>1500)throw new Exception("Repeated lookup stalled");
                    await Wait(core,"!!document.querySelector('[data-action=save-note]:not(:disabled)')");
                    write("LOOKUP "+await core.ExecuteScriptAsync("JSON.stringify({history:history.state,entries:document.querySelectorAll('[data-action=save-note]').length})"));
                    string wav=Path.Combine(args[0],"synthetic.wav");var bytes=new byte[844];
                    Array.Copy(System.Text.Encoding.ASCII.GetBytes("RIFF"),bytes,4);BitConverter.GetBytes(836).CopyTo(bytes,4);Array.Copy(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "),0,bytes,8,8);BitConverter.GetBytes(16).CopyTo(bytes,16);BitConverter.GetBytes((short)1).CopyTo(bytes,20);BitConverter.GetBytes((short)1).CopyTo(bytes,22);BitConverter.GetBytes(8000).CopyTo(bytes,24);BitConverter.GetBytes(16000).CopyTo(bytes,28);BitConverter.GetBytes((short)2).CopyTo(bytes,32);BitConverter.GetBytes((short)16).CopyTo(bytes,34);Array.Copy(System.Text.Encoding.ASCII.GetBytes("data"),0,bytes,36,4);BitConverter.GetBytes(800).CopyTo(bytes,40);File.WriteAllBytes(wav,bytes);
                    typeof(DictionaryWindow).GetField("audioPath",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(window,wav);
                    await core.ExecuteScriptAsync("document.querySelector('[data-action=save-note]').click()");await Task.Delay(7000);
                    using(var image=File.Create(Path.Combine(args[0],"lookup-render.png")))await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
                    write("PASS real Yomitan window preserved lyric keyboard focus across consecutive lookups");
                    write("DONE");
                }
            }catch(Exception error){write("FAIL "+error);}
            anchor.Close();
        };
        Application.Run(anchor);
    }
}
