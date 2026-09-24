const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const src = path.join(__dirname, 'forge-action/.github/actions/dockerless/scripts');
const base = path.join(__dirname, 'fixtures');
const out = path.join(root, 'outputs');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
fs.mkdirSync(base, {recursive:true}); fs.mkdirSync(out,{recursive:true});
const posix = p => p.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const results=[];
function run(id, file, args=[], extra={}, setup=()=>{}) {
  const dir=path.join(base,id); fs.mkdirSync(path.join(dir,'scripts'),{recursive:true});
  const env={...process.env, SIMPLE_FORGE_WORK_DIR:posix(dir), GITHUB_ENV:posix(path.join(dir,'env')), GITHUB_OUTPUT:posix(path.join(dir,'output')), TRACE:posix(path.join(dir,'trace')), ...extra};
  setup(dir,env);
  const start=performance.now();
  const p=spawnSync(bash,[posix(path.join(src,file)),...args],{env,encoding:'utf8',timeout:15000,cwd:root});
  const read=f=>fs.existsSync(path.join(dir,f))?fs.readFileSync(path.join(dir,f),'utf8'):'';
  const r={id,duration_ms:Math.round(performance.now()-start),exit_code:p.status,error:p.error?.message||null,stdout:p.stdout,stderr:p.stderr,output:read('output'),environment:read('env'),trace:read('trace')};
  results.push(r); return r;
}
const fatal=['validate-github-token','setup-branch','initialize-workflow-tracking','fetch-context','setup-claude','setup-claude-plugins','prepare-claude-conversation','run-claude-with-context','process-claude-response','commit-and-push','update-context'];
const optional=['upload-handoff-file','job-completion-summary'];
const args=['test-job','1','https://example.invalid','test-branch','test/repo','1','https://example.invalid/run','dummy-not-a-secret'];
function stubs(fail){return dir=>{
  for(const s of [...fatal,...optional,'report-workflow-failure']){
    fs.writeFileSync(path.join(dir,'scripts',s+'.sh'),'#!/bin/bash\necho '+s+' >> "$TRACE"\nexit '+(s===fail?'42':'0')+'\n');
  }
};}
run('platform-native','detect-platform.sh');
run('acquire-without-docker','acquire-scripts.sh',['pinned-test'],{DOCKER_AVAILABLE:'false'});
run('orchestrate-missing-scripts','orchestrate-workflow.sh',args);
run('orchestrate-success-stubs','orchestrate-workflow.sh',args,{},stubs(null));
for(const s of fatal) run('failure-'+s,'orchestrate-workflow.sh',args,{},stubs(s));
for(const s of optional) run('optional-failure-'+s,'orchestrate-workflow.sh',args,{},stubs(s));
// Shell syntax checks do not execute scripts or perform cleanup.
for(const file of fs.readdirSync(src).filter(x=>x.endsWith('.sh'))){
 const start=performance.now(); const p=spawnSync(bash,['-n',posix(path.join(src,file))],{encoding:'utf8'});
 results.push({id:'syntax-'+file,duration_ms:Math.round(performance.now()-start),exit_code:p.status,stdout:p.stdout,stderr:p.stderr});
}
const report={timestamp:new Date().toISOString(),scope:'Local original shell scripts; external workflow steps stubbed. No AI or GitHub write calls.',node:process.version,results};
fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(results.map(({id,duration_ms,exit_code,output})=>({id,duration_ms,exit_code,output})),null,2));
