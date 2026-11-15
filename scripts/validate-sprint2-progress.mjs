#!/usr/bin/env node
/** Validates tracker structure, not the truth of implementation claims. */
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv[2] || 'docs/sprint2/progress.json';
const full = path.resolve(process.cwd(), file);
const fail = m => { console.error('FAIL:',m); process.exitCode=1; };
if (!fs.existsSync(full)) {fail('Missing tracker: '+file);process.exit();}
let data; try {data=JSON.parse(fs.readFileSync(full,'utf8'));} catch(e) {fail('Invalid JSON: '+e.message);process.exit();}
const statuses=new Set(['not_started','partial','in_progress','blocked','verified','not_applicable']);
const tasks=Array.isArray(data.tasks)?data.tasks:[],rubric=Array.isArray(data.rubric)?data.rubric:[];
const ids=arr=>arr.map(x=>x.id),taskSet=new Set(ids(tasks)),rubricSet=new Set(ids(rubric));
if(taskSet.size!==tasks.length)fail('Duplicate task ID');
if(rubricSet.size!==rubric.length)fail('Duplicate rubric ID');
const points=rubric.reduce((sum,r)=>sum+(Number(r.max_points)||0),0);
if(rubric.length!==11||points!==100||data.assignment?.total_points!==100)fail('Rubric must have 11 groups totaling 100 points');
for(const t of tasks){
 if(!statuses.has(t.status))fail(t.id+': invalid status');
 if(!Array.isArray(t.evidence))fail(t.id+': evidence must be an array');
 if(!Array.isArray(t.definition_of_done)||!t.definition_of_done.length)fail(t.id+': missing acceptance checks');
 for(const d of t.depends_on||[])if(!taskSet.has(d))fail(t.id+': unknown dependency '+d);
 for(const r of t.rubric_ids||[])if(!rubricSet.has(r))fail(t.id+': unknown rubric '+r);
 if(t.status==='verified'&&(!t.evidence?.length||(!t.owner_confirmed&&t.owner_proposed!=='All team members')))fail(t.id+': missing verified evidence or approved owner');
}
for(const r of rubric){
 if(!statuses.has(r.status))fail(r.id+': invalid status');
 if(r.points_awarded!==null)fail(r.id+': only instructors award points');
 for(const t of r.work_item_ids||[])if(!taskSet.has(t))fail(r.id+': unknown task '+t);
 if(r.status==='verified'&&!r.evidence?.length)fail(r.id+': no verification evidence');
}
for(const a of data.required_artifacts||[]){
 if(!statuses.has(a.status)||!taskSet.has(a.task_id))fail('Invalid artifact state: '+a.path);
}
if(!Array.isArray(data.change_log)||!data.change_log.length)fail('Missing change log');
if(!/^[a-f0-9]{40}$/.test(data.repo?.audited_head_sha||''))fail('Bad audited SHA');
if(!process.exitCode)console.log('OK: '+tasks.length+' tasks, '+rubric.length+' rubric groups, '+points+' points. Tracker structure valid; code not independently verified.');
