// Exercises only our synthetic windows; never controls the user's music client.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using CloudmusicYomitan;
internal static class WindowRunner {
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]static extern IntPtr GetWindowLongPtr(IntPtr handle,int index);
    [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr handle,uint command);
    static bool Above(Form upper,Form lower){var handle=GetWindow(lower.Handle,3);for(int n=0;handle!=IntPtr.Zero&&n<256;n++,handle=GetWindow(handle,3))if(handle==upper.Handle)return true;return false;}
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    [STAThread]static void Main(string[] args){
        if(args.Length!=1)return;Directory.CreateDirectory(args[0]);var log=Path.Combine(args[0],"window.log");
        Application.EnableVisualStyles();
        var main=new Form{Text="ncm-Yotiman synthetic client",Width=500,Height=200};
        main.Shown+=async(s,e)=>{
            try{
                using(var lookup=new DictionaryWindow(null,"",true))using(var settings=new DictionaryWindow(null,"",false)){
                    lookup.Reveal();await Task.Delay(100);main.Activate();main.BringToFront();await Task.Delay(100);
                    Require((GetWindowLongPtr(lookup.Handle,-20).ToInt64()&8)!=0,"Lookup has no native TOPMOST style");
                    Require(Above(lookup,main),"Music-client foreground covered the lookup window");
                    File.AppendAllText(log,"PASS foreground client cannot cover lookup\n");
                    lookup.WindowState=FormWindowState.Minimized;lookup.TopMost=false;lookup.Reveal();await Task.Delay(100);
                    Require(lookup.WindowState!=FormWindowState.Minimized&&Above(lookup,main),"Reused/minimized lookup was not restored above client");
                    File.AppendAllText(log,"PASS repeated lookup restores minimized window and topmost\n");
                    settings.Reveal();await Task.Delay(100);
                    Require((GetWindowLongPtr(settings.Handle,-20).ToInt64()&8)==0,"Settings should remain an ordinary window");
                    File.AppendAllText(log,"PASS settings remains ordinary\nPASS\n");
                }
            }catch(Exception error){File.AppendAllText(log,"FAIL "+error+"\n");}
            main.Close();
        };
        Application.Run(main);
    }
}
