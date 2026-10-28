// MIT. Yomitan is loaded unchanged from its separately installed GPL release.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Diagnostics;
using System.Drawing;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace CloudmusicYomitan {
    internal static class Json {
        internal static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer { MaxJsonLength=32*1024*1024 };
        internal static string Encode(object value) => Serializer.Serialize(value);
        internal static Dictionary<string,object> Read(string text) => Serializer.Deserialize<Dictionary<string,object>>(text);
        internal static string Text(Dictionary<string,object> value,string key) => value.TryGetValue(key,out var v) ? v as string ?? "" : "";
        internal static string Hash(string value) { using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-",""); }
    }
    internal static class Program {
        [STAThread] static void Main(string[] args) {
            if(args.Length!=2 || args[0]!="--data") return;
            string root=Path.GetFullPath(args[1]);
            Directory.CreateDirectory(Path.Combine(root,"requests"));
            using(var single=new Mutex(false,"Local\\NcmYotiman-"+Json.Hash(root.ToUpperInvariant()))) {
                bool owned; try { owned=single.WaitOne(0); } catch(AbandonedMutexException) { owned=true; }
                if(!owned) return;
                try {
                    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                    using(var context=new HostContext(root)) Application.Run(context);
                } finally { single.ReleaseMutex(); }
            }
        }
    }
    internal static class WindowPolicy {
        [DllImport("user32.dll")]internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
        [DllImport("user32.dll")]internal static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll")]internal static extern bool IsWindowVisible(IntPtr window);
        internal static Func<IntPtr,bool> IsMusicWindow=window=>{try{GetWindowThreadProcessId(window,out var pid);return Process.GetProcessById((int)pid).ProcessName.Equals("cloudmusic",StringComparison.OrdinalIgnoreCase);}catch{return false;}};
        internal static IntPtr MusicForeground(){var window=GetForegroundWindow();return window!=IntPtr.Zero&&IsMusicWindow(window)&&!IsIconic(window)?window:IntPtr.Zero;}
        internal sealed class OwnerWindow:IWin32Window{public IntPtr Handle{get;}internal OwnerWindow(IntPtr handle){Handle=handle;}}
    }
    internal sealed class HostContext : ApplicationContext {
        readonly string root,requests;
        readonly Control dispatcher=new Control();
        readonly FileSystemWatcher watcher;
        readonly System.Windows.Forms.Timer idle=new System.Windows.Forms.Timer {Interval=30000};
        readonly HashSet<string> processing=new HashSet<string>();
        CoreWebView2Environment environment;
        Task<CoreWebView2Environment> environmentTask;
        DictionaryWindow settings,lookup;
        bool scanning;DateTime lastActivity=DateTime.UtcNow;
        internal HostContext(string path) {
            root=path; requests=Path.Combine(root,"requests");
            var handle=dispatcher.Handle;
            watcher=new FileSystemWatcher(requests,"*.ready");
            watcher.Created+=(s,e)=>Schedule(); watcher.Renamed+=(s,e)=>Schedule(); watcher.EnableRaisingEvents=true;
            File.WriteAllText(Path.Combine(root,"host.ready"),Process.GetCurrentProcess().Id.ToString());
            idle.Tick+=(s,e)=>{if(processing.Count==0&&DateTime.UtcNow-lastActivity>TimeSpan.FromMinutes(2)&&(settings==null||!WindowPolicy.IsWindowVisible(settings.Handle))&&(lookup==null||!WindowPolicy.IsWindowVisible(lookup.Handle)))ExitThread();};
            idle.Start(); Schedule();
        }
        void Schedule() { if(!dispatcher.IsDisposed) dispatcher.BeginInvoke(new Action(Scan)); }
        async void Scan() {
            if(scanning)return;scanning=true;
            var visited=new HashSet<string>();
            try{while(true){
            var markers=Directory.GetFiles(requests,"*.ready").Where(marker=>!visited.Contains(marker)).ToArray();if(markers.Length==0)break;
            foreach(string marker in markers) {
                visited.Add(marker);
                string file=marker.Substring(0,marker.Length-6);
                if(processing.Contains(file)) continue; processing.Add(file);
                try {
                    var info=new FileInfo(file);
                    if(info.Length>128*1024) throw new InvalidDataException("查词请求过大");
                    var command=Json.Read(File.ReadAllText(file,Encoding.UTF8));
                    if(!command.TryGetValue("created",out var created) || Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-Convert.ToDouble(created))>60000) throw new InvalidDataException("查词请求已过期");
                    string action=Json.Text(command,"action");
                    if(action=="shutdown") { Reply(file,null); ExitThread(); return; }
                    if(action!="settings" && action!="lookup"&&action!="warmup") throw new InvalidDataException("未知词典操作");
                    lastActivity=DateTime.UtcNow;var source=WindowPolicy.MusicForeground();
                    var form=action=="settings" ? settings : lookup;
                    if(form==null || form.IsDisposed) {
                        form=new DictionaryWindow(await Environment(),Path.GetDirectoryName(Application.ExecutablePath),action!="settings");
                        if(action=="settings") settings=form; else lookup=form;
                        form.FormClosed+=(s,e)=>{ if(settings==s) settings=null; if(lookup==s) lookup=null; };
                    }
                    if(action=="warmup")await form.Warmup(Json.Text(command,"theme"));else await form.Open(command,source);
                    Reply(file,null,action=="lookup"?form.LastMatch:null);
                } catch(Exception error) { Reply(file,error.Message); }
                finally { processing.Remove(file); }
            }
            }}finally{scanning=false;}
        }
        Task<CoreWebView2Environment> Environment() => environmentTask ?? (environmentTask=CreateEnvironment());
        async Task<CoreWebView2Environment> CreateEnvironment() {
            string extension=Path.Combine(Path.GetDirectoryName(Application.ExecutablePath),"yomitan");
            if(!File.Exists(Path.Combine(extension,"manifest.json"))) throw new FileNotFoundException("未安装实验版 Yomitan 组件，请先运行构建步骤");
            environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"profile"),new CoreWebView2EnvironmentOptions {AreBrowserExtensionsEnabled=true});
            return environment;
        }
        static void Reply(string file,string error,object match=null) {
            try {
                File.WriteAllText(file+".reply.pending",Json.Encode(new {ok=error==null,error,match}),new UTF8Encoding(false));
                File.Move(file+".reply.pending",file+".reply");
                File.Delete(file); // requests contain one transient lyric line, not a lyric cache
                File.Delete(file+".ready");
            } catch(IOException) { }
        }
        protected override void ExitThreadCore() {
            try{File.Delete(Path.Combine(root,"host.ready"));}catch(IOException){}
            watcher.Dispose(); idle.Dispose(); settings?.Dispose(); lookup?.Dispose(); dispatcher.Dispose();
            base.ExitThreadCore();
        }
    }
    internal sealed class DictionaryWindow : Form {
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr handle,int command);
        [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
        readonly WebView2 view=new WebView2 {Dock=DockStyle.Fill};
        readonly CoreWebView2Environment environment;
        readonly string home;
        readonly bool isLookup;
        readonly Label audioStatus=new Label {AutoSize=true,Text="未附加音频"};
        readonly TextBox audioField=new TextBox {Width=110,Text="SentenceAudio"};
        string extensionId,scriptId,audioPath;
        Task initializeTask;
        Task searchTask;TaskCompletionSource<bool> pageReady;string pendingTerm,pendingSentence;int pendingOffset;TaskCompletionSource<bool> lookupReady;
        internal object LastMatch {get;private set;}
        internal DictionaryWindow(CoreWebView2Environment env,string directory,bool lookup) {
            environment=env; home=directory; isLookup=lookup;
            Text=lookup ? "Yomitan · 歌词查词" : "Yomitan · 词典与 Anki 设置";
            Width=lookup ? 700 : 1100; Height=800;TopMost=false;ShowIcon=false;Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Dpi;
            Controls.Add(view);
            if(lookup)FormClosing+=(s,e)=>{if(e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();}};
        }
        internal void Reveal(IntPtr source=default(IntPtr)) {
            if(isLookup&&(source==IntPtr.Zero||WindowPolicy.GetForegroundWindow()!=source||WindowPolicy.IsIconic(source)))return;
            TopMost=false;
            if(WindowState==FormWindowState.Minimized) WindowState=FormWindowState.Normal;
            if(!Visible){if(isLookup)Show(new WindowPolicy.OwnerWindow(source));else Show();}
            ShowWindow(Handle,5);BringToFront();Activate();
        }
        internal async Task Warmup(string theme){ApplyTheme(theme);await EnsureSearch();}
        void ApplyTheme(string theme){bool dark=theme!="light";BackColor=dark?Color.FromArgb(25,27,31):Color.FromArgb(249,250,252);if(view.CoreWebView2!=null)view.CoreWebView2.Profile.PreferredColorScheme=dark?CoreWebView2PreferredColorScheme.Dark:CoreWebView2PreferredColorScheme.Light;int value=dark?1:0;try{DwmSetWindowAttribute(Handle,20,ref value,4);}catch(DllNotFoundException){} }
        async Task EnsureSearch(){
            if(searchTask!=null&&searchTask.Status==TaskStatus.RanToCompletion)return;
            initializeTask=initializeTask??Initialize();await initializeTask;if(searchTask==null)searchTask=LoadSearch();await searchTask;
        }
        async Task LoadSearch(){pageReady=new TaskCompletionSource<bool>();view.CoreWebView2.Navigate("chrome-extension://"+extensionId+"/search.html?query=%E3%81%82&type=terms&wildcards=off");if(await Task.WhenAny(pageReady.Task,Task.Delay(15000))!=pageReady.Task){searchTask=null;string state=await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({page:location.pathname,loaded:document.documentElement.dataset.loaded,bridge:document.documentElement.dataset.fgBridge,error:document.documentElement.dataset.fgBridgeError})");throw new TimeoutException("词典页面初始化超时："+state);}}
        internal async Task Open(Dictionary<string,object> command,IntPtr source=default(IntPtr)) {
            ApplyTheme(Json.Text(command,"theme"));
            if(isLookup) {
                string term=Json.Text(command,"term"),sentence=Json.Text(command,"sentence"),title=Json.Text(command,"title"),url=Json.Text(command,"url");
                int offset=command.TryGetValue("offset",out var raw) ? Convert.ToInt32(raw) : 0;
                if(term.Length==0 || term.Length>120 || sentence.Length>4000 || offset<0 || offset+term.Length>sentence.Length || sentence.Substring(offset,term.Length)!=term) throw new InvalidDataException("选词与原文不一致，请重新选择同一行中的文字");
                ClearAudio();
                object segments=ValidateSegments(command,sentence);
                await EnsureSearch();ApplyTheme(Json.Text(command,"theme"));
                pendingTerm=term;pendingSentence=sentence;pendingOffset=offset;LastMatch=null;lookupReady=new TaskCompletionSource<bool>();
                string result=await view.CoreWebView2.ExecuteScriptAsync("window.NcmYotimanLookup("+Json.Encode(new {term,sentence,segments,offset,title,url,theme=Json.Text(command,"theme"),matchMode=Json.Text(command,"matchMode")})+")");
                if(result!="true")throw new InvalidOperationException("词典页面未就绪");
                Reveal(source);if(await Task.WhenAny(lookupReady.Task,Task.Delay(8000))!=lookupReady.Task)throw new TimeoutException("词典查询超时，请重试");await lookupReady.Task;
            }else{initializeTask=initializeTask??Initialize();await initializeTask;ApplyTheme(Json.Text(command,"theme"));view.CoreWebView2.Navigate("chrome-extension://"+extensionId+"/settings.html");Reveal();}
        }
        async Task Initialize() {
            string extensionDirectory=PrepareExtensionDirectory();
            await view.EnsureCoreWebView2Async(environment);
            var core=view.CoreWebView2;
            var extensions=await core.Profile.GetBrowserExtensionsAsync();
            var extension=extensions.FirstOrDefault(e=>e.Name=="Yomitan Popup Dictionary");
            if(extension==null) extension=await core.Profile.AddBrowserExtensionAsync(extensionDirectory);
            if(!extension.IsEnabled) await extension.EnableAsync(true);
            extensionId=extension.Id;
            string bridge=File.ReadAllText(Path.Combine(home,"page-bridge.js"),Encoding.UTF8).Replace("__FG_CONTEXT__",Json.Encode(new {sentence="",segments=new object[0],offset=0,title="",url="",theme="dark"}));
            scriptId=await core.AddScriptToExecuteOnDocumentCreatedAsync(File.ReadAllText(Path.Combine(home,"range-match.js"),Encoding.UTF8)+"\n"+bridge);
            core.NavigationStarting+=(s,e)=>{
                var uri=new Uri(e.Uri);
                if(uri.Scheme!="chrome-extension" || uri.Host!=extensionId) e.Cancel=true;
            };
            core.NewWindowRequested+=(s,e)=>{
                e.Handled=true;
                // In WebView2 the extension's startup welcome tab may be marked
                // user-initiated. It must not replace the requested lookup/settings.
                if(e.Uri.EndsWith("/welcome.html",StringComparison.Ordinal)) return;
                if(Uri.TryCreate(e.Uri,UriKind.Absolute,out var target) && target.Scheme=="chrome-extension" && target.Host==extensionId) core.Navigate(e.Uri);
                else if(Uri.TryCreate(e.Uri,UriKind.Absolute,out target) && (target.Scheme=="https" || target.Scheme=="http"))
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(target.AbsoluteUri) {UseShellExecute=true});
            };
            core.WebMessageReceived+=(s,e)=>{
                if(!Uri.TryCreate(e.Source,UriKind.Absolute,out var source) || source.Host!=extensionId || source.AbsolutePath!="/search.html") return;
                var request=Json.Read(e.WebMessageAsJson); object id=request.TryGetValue("id",out var value) ? value : null;
                if(Json.Text(request,"action")=="pageReady"){pageReady?.TrySetResult(true);return;}
                if(Json.Text(request,"action")=="lookupComplete"){
                    if(Json.Text(request,"query")!=pendingTerm)return;
                    try{
                        if(!string.IsNullOrEmpty(Json.Text(request,"error")))throw new InvalidDataException(Json.Text(request,"error"));
                        if(request.TryGetValue("match",out var matched)&&matched is Dictionary<string,object> match){
                            int at=Convert.ToInt32(match["offset"]),length=Convert.ToInt32(match["length"]);string text=Json.Text(match,"text");
                            if(at<pendingOffset||length<=0||length>pendingTerm.Length||at-pendingOffset>pendingTerm.Length-length||pendingSentence.Substring(at,length)!=text)throw new InvalidDataException("词典返回的匹配超出选区");
                            LastMatch=new {offset=at,length,text};
                        }
                        lookupReady?.TrySetResult(true);
                    }catch(Exception error){lookupReady?.TrySetException(error);}return;
                }
                try {
                    if(Json.Text(request,"action")!="audioForNote") return;
                    object audio=null;
                    if(audioPath!=null) {
                        string field=audioField.Text.Trim(); var fields=((System.Collections.IEnumerable)request["fields"]).Cast<object>();
                        if(!fields.Contains(field)) throw new InvalidDataException("Anki 模板没有字段「"+field+"」，请填写正确的音频字段名或清除附件");
                        var file=new FileInfo(audioPath);
                        if(file.Length>20*1024*1024) throw new InvalidDataException("音频超过 20 MB，请先截取较短片段");
                        byte[] bytes=File.ReadAllBytes(audioPath);
                        string hash; using(var sha=SHA256.Create()) hash=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();
                        audio=new {field,filename="furigana-sharex-"+hash+file.Extension.ToLowerInvariant(),data=Convert.ToBase64String(bytes)};
                    }
                    core.PostWebMessageAsJson(Json.Encode(new {id,audio}));
                } catch(Exception error) { core.PostWebMessageAsJson(Json.Encode(new {id,error=error.Message})); }
            };
        }
        static object ValidateSegments(Dictionary<string,object> command,string sentence) {
            if(!command.TryGetValue("segments",out var raw)) return new object[0];
            var result=new List<object>();var text=new StringBuilder();
            if(!(raw is System.Collections.IEnumerable values)) throw new InvalidDataException("振假名快照无效");
            foreach(var value in values) {
                if(!(value is Dictionary<string,object> segment)) throw new InvalidDataException("振假名片段无效");
                string part=Json.Text(segment,"text"),reading=Json.Text(segment,"reading");
                if(part.Length>4000||reading.Length>100||result.Count>=4096) throw new InvalidDataException("振假名快照过大");
                text.Append(part);result.Add(new {text=part,reading});
            }
            if(result.Count>0&&text.ToString()!=sentence) throw new InvalidDataException("振假名与歌词不一致，请重新选词");
            return result;
        }
        string PrepareExtensionDirectory() {
            // A persistent unpacked path gives the extension a stable origin.
            // BetterNCM may recreate plugins_runtime during every update.
            string source=Path.Combine(home,"yomitan"),baseDir=Path.Combine(Path.GetDirectoryName(environment.UserDataFolder),"runtime");
            string target=Path.Combine(baseDir,"yomitan");
            string version=Json.Text(Json.Read(File.ReadAllText(Path.Combine(source,"manifest.json"))),"version");
            string installed=Path.Combine(target,"manifest.json");
            if(File.Exists(installed)&&Json.Text(Json.Read(File.ReadAllText(installed)),"version")==version)return target;
            Directory.CreateDirectory(baseDir);string next=target+".pending-"+Guid.NewGuid().ToString("N");
            CopyDirectory(source,next);
            if(Directory.Exists(target))Directory.Move(target,target+".previous-"+DateTime.UtcNow.ToString("yyyyMMddHHmmss"));
            Directory.Move(next,target);return target;
        }
        static void CopyDirectory(string source,string target) {
            if((File.GetAttributes(source)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("组件目录不能是链接");
            Directory.CreateDirectory(target);
            foreach(string file in Directory.GetFiles(source))File.Copy(file,Path.Combine(target,Path.GetFileName(file)));
            foreach(string directory in Directory.GetDirectories(source))CopyDirectory(directory,Path.Combine(target,Path.GetFileName(directory)));
        }
        void ClearAudio() { audioPath=null; audioStatus.Text="未附加音频"; }
        void ChooseAudio() {
            using(var dialog=new OpenFileDialog {Title="选择 ShareX 录制的歌曲片段",Filter="音频文件|*.mp3;*.wav;*.ogg;*.m4a;*.aac;*.flac;*.webm",Multiselect=false}) {
                if(dialog.ShowDialog(this)!=DialogResult.OK) return;
                if(new FileInfo(dialog.FileName).Length>20*1024*1024) { MessageBox.Show(this,"请选择不超过 20 MB 的音频片段"); return; }
                audioPath=dialog.FileName; audioStatus.Text=Path.GetFileName(audioPath);
            }
        }
        protected override void Dispose(bool disposing) { if(disposing) view.Dispose(); base.Dispose(disposing); }
    }
}
