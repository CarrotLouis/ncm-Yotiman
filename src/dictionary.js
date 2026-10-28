/* Optional Yomitan companion bridge; disabled by default, no idle polling. MIT. */
(function(root,factory) {
	if(typeof module==='object' && module.exports) module.exports=factory(require('./selection.js'));
	else root.NcmYotimanDictionary=factory(root.NcmYotimanSelection);
})(typeof globalThis!=='undefined'?globalThis:this,function(capture) {
	'use strict';
	const TAB='ncm-yotiman';
	const LINES=capture.LINES;
	function quotePath(value) {
		if(!value || /["\r\n\x00]/.test(value)) throw new Error('词典组件路径无效');
		return '"'+value+'"';
	}
	function transport(bn,plugin) {
		let rootPromise;
		const root=()=>rootPromise || (rootPromise=bn.app.getDataPath().then(p=>p.replace(/\\/g,'/')+'/ncm-yotiman'));
		async function send(action,context={}) {
			const base=await root(),dir=base+'/requests',exe=plugin.pluginPath+'/yomitan-host/CloudmusicYomitan.exe';
			if(!await bn.fs.exists(exe)) {
				if(action==='shutdown') return;
				throw new Error('尚未安装 Yomitan 组件，请按 README 构建完整插件');
			}
			if(!await bn.fs.mkdir(dir)) throw new Error('无法创建 Yomitan 独立数据目录');
			const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),path=dir+'/'+id+'.json';
			// A separate marker is created only after writeFile has finished.
			const text=JSON.stringify({...context,action,created:Date.now()});
			if(!await bn.fs.writeFile(path,new Blob([text],{type:'application/json'}))) throw new Error('无法写入查词请求');
			if(!await bn.fs.writeFile(path+'.ready',new Blob(['1']))) throw new Error('无法提交查词请求');
			if(!await bn.app.exec(quotePath(exe)+' --data '+quotePath(base),false,false)) throw new Error('无法启动 Yomitan 独立窗口');
			for(let i=0;i<140;i++) {
				if(await bn.fs.exists(path+'.reply')) {
					const reply=JSON.parse(await bn.fs.readFileText(path+'.reply'));
					try { await bn.fs.remove(path+'.reply'); } catch(_) { /* opened window remains usable */ }
					if(!reply.ok) throw new Error(reply.error || 'Yomitan 打开失败');
					return;
				}
				await new Promise(resolve=>setTimeout(resolve,250));
			}
			throw new Error('Yomitan 启动超时，请检查独立窗口或 WebView2 运行时');
		}
		return {send};
	}
	function install(api,doc=document) {
		const win=doc.defaultView,menus=new Map(); let enabled=false,armed=false,anchor=null,swallowClick=false,inflight=false,error='',disposed=false,notice=null,noticeTimer;
		const diagnostics={down:0,selected:0,sent:0,last:'尚未查词'};
		const bridge=api.transport || transport(api.betterncm,api.plugin);
		const style=doc.createElement('style');
		style.textContent=`${LINES.split(',').map(s=>'body.fg-dictionary-select '+s+',body.fg-dictionary-select '+s+' *').join(',')} {user-select:text!important;-webkit-user-select:text!important;cursor:text!important;-webkit-app-region:no-drag!important}
		body.fg-dictionary-select .fg-rt,body.fg-dictionary-select rt,body.fg-dictionary-select .rnp-karaoke-word-filler {user-select:none!important;-webkit-user-select:none!important;pointer-events:none!important}
		[data-tab="${TAB}"] .fg-dictionary-hint {opacity:.65;font-size:13px;line-height:1.6;margin:12px 0;white-space:pre-wrap}
		[data-tab="${TAB}"] button {border-radius:6px;padding:6px} [data-tab="${TAB}"] [role="alert"] {color:#ffb4ab}`;
		doc.head.append(style);
		function refresh() {
			for(const {group} of menus.values()) {
				group.querySelector('input').checked=!!api.config().dictionaryEnabled;
				group.querySelector('[role="status"]').textContent=enabled?'按住 Shift 选择同一行中的词语，松开鼠标查词。\n'+diagnostics.last:'词典已关闭';
				group.querySelector('[role="alert"]').textContent=error;
			}
		}
		async function send(action,context) {
			try { error=''; refresh(); await bridge.send(action,context); }
			catch(e) {
				if(action==='shutdown' || disposed) return;
				error=e.message; refresh(); api.error && api.error(error);
				if(!notice) { notice=doc.createElement('div');notice.setAttribute('role','alert');notice.style.cssText='position:fixed;bottom:32px;left:50%;transform:translateX(-50%);z-index:2147483000;padding:12px 18px;border-radius:8px;background:#292929;color:#fff;max-width:80vw;white-space:pre-wrap;line-height:1.5';doc.body.append(notice); }
				notice.textContent='Yomitan：'+error;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.remove();notice=null;},10000);
				throw e;
			}
		}
		function openSettings() { return send('settings'); }
		function reset() { armed=false;anchor=null;swallowClick=false;doc.body.classList.remove('fg-dictionary-select'); }
		function shift(e) {
			if(!enabled || e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]')) return;
			if(e.key==='Shift') doc.body.classList.toggle('fg-dictionary-select',e.type==='keydown');
		}
		function down(e) {
			swallowClick=false;
			if(!enabled || !e.shiftKey || e.button!==0 || !e.target.closest(LINES)) return;
			win.getSelection().removeAllRanges(); // Shift must not extend a previous lookup's selection.
			diagnostics.down++;doc.body.classList.add('fg-dictionary-select');anchor=capture.begin(doc,e);
			armed=true;e.stopImmediatePropagation();
			if(anchor)e.preventDefault(); // Own the range when the client suppresses native text selection.
		}
		function move(e){if(armed&&anchor){e.preventDefault();e.stopImmediatePropagation();capture.extend(doc,anchor,e);}}
		async function up(e) {
			if(!armed) return; armed=false;swallowClick=true;e.stopImmediatePropagation();
			if(anchor)capture.extend(doc,anchor,e);anchor=null;
			const selected=capture.fromSelection(win.getSelection(),doc);
			if(!selected){diagnostics.last='未选中有效的同一行原文，请从字面拖选；也可查看本插件的运行状态。';refresh();return;}
			diagnostics.selected++;if(inflight)return;
			inflight=true;
			try {
				const track=await api.track(); if(!enabled)return;if(!track || !track.id)throw new Error('未取得歌曲 ID，请打开歌曲播放页后重试');
				diagnostics.sent++;diagnostics.last='正在查词…';refresh();
				await send('lookup',{...selected,title:track.title || '',url:'https://music.163.com/song?id='+encodeURIComponent(track.id)});
				diagnostics.last='查词窗口已打开';refresh();
			} catch(e) { error=e.message;diagnostics.last='查词失败：'+e.message;refresh(); } finally { inflight=false; }
		}
		function click(e) { if(enabled && (e.shiftKey || swallowClick) && e.target.closest(LINES)) {swallowClick=false;e.preventDefault();e.stopImmediatePropagation();} }
		function setEnabled(value) {
			const next=!!value; if(next===enabled) {refresh();return;}
			enabled=next; reset();
			for(const [type,fn] of [['keydown',shift],['keyup',shift]]) win[enabled?'addEventListener':'removeEventListener'](type,fn,true);
			// Window capture precedes RNP's document/React click-to-seek handlers.
			// pointerdown preventDefault in the host suppresses compatibility mouse
			// events; use the pointer family when supported, and mouse only on old CEF.
			const pointer='PointerEvent' in win;
			for(const [type,fn] of [[pointer?'pointerdown':'mousedown',down],[pointer?'pointermove':'mousemove',move],[pointer?'pointerup':'mouseup',up],['click',click]]) win[enabled?'addEventListener':'removeEventListener'](type,fn,true);
			win[enabled?'addEventListener':'removeEventListener']('blur',reset);
			if(!enabled) send('shutdown').catch(()=>{});
			refresh();
		}
		function scan() {
			if(disposed) return;
			for(const [menu,binding] of menus) if(!menu.isConnected || !binding.tab.isConnected || !binding.group.isConnected) {binding.dispose();menus.delete(menu);}
			for(const menu of doc.querySelectorAll('.rnp-settings-menu')) {
				if(menus.has(menu)) continue;
				const anchor=menu.querySelector('.rnp-settings-menu-tabs [data-tab="jp-furigana-plus"]')||menu.querySelector('.rnp-settings-menu-tabs [data-tab="lyric"]');
				const section=menu.querySelector('.rnp-settings-menu-inner .rnp-group[data-tab="jp-furigana-plus"]')||menu.querySelector('.rnp-settings-menu-inner .rnp-group[data-tab="lyric"]');
				if(!anchor || !section) continue;
				const tab=doc.createElement('div'),group=doc.createElement('div');
				tab.className='rnp-settings-menu-tab';tab.dataset.tab=TAB;tab.textContent='词典';tab.tabIndex=0;tab.setAttribute('role','button');
				group.className='rnp-group';group.dataset.tab=TAB;
				const id='fg-dictionary-'+Math.random().toString(36).slice(2);
				group.innerHTML='<div class="rnp-group-title">词典</div><div class="rnp-checkbox-wrapper"><input type="checkbox" class="rnp-checkbox" id="'+id+'"><label class="rnp-checkbox-label" for="'+id+'">启用 Yomitan 词典</label></div><button type="button" class="rnp-select-group-btn">打开 Yomitan 设置</button><p class="fg-dictionary-hint" role="status"></p><p class="fg-dictionary-hint">在独立设置窗口中导入词典、配置 Anki。Anki 的句子字段使用 {sentence}；音频可在查词窗口附加 ShareX 已录制的文件。</p><p class="fg-dictionary-hint" role="alert"></p>';
				anchor.after(tab);section.after(group);
				const inner=section.parentElement,tabs=tab.parentElement;let frame=null;
				function highlight(){frame=null;const groups=[...inner.children].filter(n=>n.classList.contains('rnp-group'));let active=groups[0];for(const item of groups)if(item.offsetTop<=inner.scrollTop+32)active=item;if(inner.scrollHeight>inner.clientHeight&&inner.scrollTop+inner.clientHeight>=inner.scrollHeight-1)active=groups[groups.length-1];if(active)for(const item of tabs.children)if(item.classList.contains('rnp-settings-menu-tab'))item.classList.toggle('active',item.dataset.tab===active.dataset.tab);}
				const schedule=()=>{if(frame===null)frame=win.requestAnimationFrame(highlight);};inner.addEventListener('scroll',schedule);
				menus.set(menu,{tab,group,dispose(){inner.removeEventListener('scroll',schedule);if(frame!==null)win.cancelAnimationFrame(frame);tab.remove();group.remove();}});
				const navigate=()=>{inner.scrollTo({top:group.offsetTop+5,behavior:'smooth'});schedule();};
				tab.onclick=navigate;tab.onkeydown=e=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();navigate();}};
				group.querySelector('input').onchange=e=>api.set('dictionaryEnabled',e.target.checked);
				group.querySelector('button').onclick=()=>openSettings().catch(()=>{});
			}
			refresh();
		}
		const observer=new win.MutationObserver(records=>{
			const selector='.rnp-settings-menu,.rnp-settings-menu-tabs,.rnp-settings-menu-inner,[data-tab="jp-furigana-plus"]';
			if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches(selector)||n.querySelector(selector))))) scan();
		});
		observer.observe(doc.body,{childList:true,subtree:true});
		const unsubscribe=api.subscribe(()=>setEnabled(api.config().dictionaryEnabled));
		setEnabled(api.config().dictionaryEnabled);scan();
		return {openSettings,setEnabled,diagnostics:()=>({...diagnostics}),status:()=>error,destroy(){disposed=true;setEnabled(false);observer.disconnect();unsubscribe();style.remove();clearTimeout(noticeTimer);if(notice)notice.remove();for(const binding of menus.values())binding.dispose();menus.clear();}};
	}
	return {install,selectionContext:capture.fromSelection,transport,quotePath};
});
