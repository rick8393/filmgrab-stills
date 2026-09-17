'use strict';
	const {spawnSync}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');
	function arg(n,d=''){const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d}
	const exe=process.platform==='win32'?'rpa-dev-local.exe':'rpa-dev-local';
	const manifest=path.resolve(__dirname,'../assets/release.json');
	function doubaoRoot(){if(process.env.RPA_DEV_LOCAL_USERDATA_ROOT)return process.env.RPA_DEV_LOCAL_USERDATA_ROOT;if(process.platform==='darwin')return path.join(os.homedir(),'Library','Application Support','Doubao');if(process.platform==='win32')return path.join(process.env.LOCALAPPDATA||process.env.APPDATA||path.join(os.homedir(),'AppData','Local'),'Doubao');return path.join(os.homedir(),'.config','Doubao')}
	function candidateHomes(){const values=[];if(process.env.RPA_DEV_LOCAL_HOME)values.push(process.env.RPA_DEV_LOCAL_HOME);let m={};try{m=JSON.parse(fs.readFileSync(manifest,'utf8'))}catch{}const roots=[process.env.RPA_DEV_LOCAL_PRODUCTION_HOME,path.join(doubaoRoot(),'rpa-dev','local-production'),path.join(os.homedir(),'.rpa-dev','local-production')].filter(Boolean);for(const root of [...new Set(roots)]){try{const registry=JSON.parse(fs.readFileSync(path.join(root,'devices.json'),'utf8'));const name=arg('--device')||m.device||registry.default;const home=registry.devices?.[name]?.direct?.local_home;if(home)values.push(home)}catch{}}values.push(path.join(doubaoRoot(),'rpa-dev','local-preview'));values.push(path.join(os.homedir(),'.rpa-dev','local-preview'));return [...new Set(values)]}
	function findCli(){if(process.env.RPA_DEV_LOCAL)return process.env.RPA_DEV_LOCAL;for(const home of candidateHomes()){try{const install=JSON.parse(fs.readFileSync(path.join(home,'install.json'),'utf8'));if(install.runtime_executable&&fs.existsSync(install.runtime_executable))return install.runtime_executable}catch{}const value=path.join(home,'agent-runtime','bin',exe);if(fs.existsSync(value))return value}return ''}
	const cli=findCli();if(!cli){process.stdout.write(JSON.stringify({success:false,error:{code:'RPA_DEV_LOCAL_RUNTIME_NOT_FOUND',message:'请先准备好浏览器自动化助手，再重新尝试。'}}));process.exit(1)}
	if(process.argv.includes('--cleanup-browser')){const cleanupArgs=['local','browser','cleanup','--scope',arg('--cleanup-scope'),'--manifest',manifest];if(arg('--device'))cleanupArgs.push('--device',arg('--device'));const run=spawnSync(cli,cleanupArgs,{encoding:'utf8'});process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');process.exit(run.status??1)}
	if(arg('--cleanup-scope'))process.env.RPA_DEV_LOCAL_CLEANUP_SCOPE=arg('--cleanup-scope');
	const args=['local','production','run','--manifest',manifest];
	const paramFile=arg('--param-file','')||arg('--param-json-file','');
	if(paramFile){args.push('--param-file',path.resolve(paramFile))}else{args.push('--param-json',arg('--param-json','{}'))}
const device=arg('--device');const transport=arg('--transport','auto');if(device)args.push('--device',device);if(transport!=='auto')args.push('--transport',transport);
const run=spawnSync(cli,args,{encoding:'utf8'});
	process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');process.exit(run.status??1);
