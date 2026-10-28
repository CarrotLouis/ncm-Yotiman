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
                    main.Activate();await Task.Delay(100);lookup.Reveal(main.Handle);await Task.Delay(100);
                    Require((GetWindowLongPtr(lookup.Handle,-20).ToInt64()&8)==0,"Lookup must not be globally TOPMOST");
                    Require(GetWindow(lookup.Handle,4)==main.Handle&&Above(lookup,main),"Lookup must belong to the requesting client");
                    Require(!lookup.ShowIcon&&lookup.Controls.Count==1,"Lookup should have no title icon or ShareX toolbar");
                    File.AppendAllText(log,"PASS lookup is an ordinary owned window without extra toolbar\n");
                    using(var other=new Form{Text="Synthetic unrelated app"}){other.Show();other.Activate();await Task.Delay(250);var before=WindowPolicy.GetForegroundWindow();Require(before!=main.Handle,"Test could not move focus away from the client");lookup.Reveal(main.Handle);await Task.Delay(100);Require(WindowPolicy.GetForegroundWindow()==before,"Background client stole foreground focus");}
                    File.AppendAllText(log,"PASS background request does not steal focus\n");
                    main.WindowState=FormWindowState.Minimized;await Task.Delay(150);Require(!WindowPolicy.IsWindowVisible(lookup.Handle),"Minimized client left lookup visible");
                    main.WindowState=FormWindowState.Normal;main.Activate();await Task.Delay(100);lookup.Reveal(main.Handle);await Task.Delay(100);
                    Require(lookup.WindowState!=FormWindowState.Minimized&&Above(lookup,main),"Repeated lookup did not restore the owned window");
                    File.AppendAllText(log,"PASS client minimize hides lookup; next lookup restores it\n");
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
