// Test-only rendering of an unfamiliar evaluator concern. Production handlers
// receive the real UI event; no production evaluator or sign gate is replaced.
import {h,render} from 'preact';
import {InjectionProgressSummary} from '../../src/presentation/InjectionProgressSummary';
import {projectInjectionWorkflowProgress} from '../../src/application/injection-workflow-progress';
import {InjectionEngine} from '../../src/domain/injection';
import {documentedInjection} from '../unit/injection-progress-fixture';
window.__mountUnfamiliarConcern=()=>{
 const encounter=documentedInjection();encounter.priorSite=encounter.site;
 const evaluation=InjectionEngine.evaluate(encounter,{today:'2026-10-02'});
 const unknown={code:'future.check',severity:'stop',section:'future-rules',field:'futureRules.signal',message:'Unrecognized safety check requires review.'};
 const injected={...evaluation,readiness:'blocked',stops:[unknown,...evaluation.stops]};
 const progress=projectInjectionWorkflowProgress({encounter,evaluation:injected,canSign:false,canSave:true,lifecycle:'draft',capabilityDetail:unknown.message});
 const host=document.createElement('div');host.id='unfamiliar-concern-probe';
 host.style.cssText='position:fixed;bottom:20px;right:20px;width:480px;max-height:250px;overflow:auto;z-index:20;background:white;border:1px solid black';
 document.querySelector('#lf-workstation').append(host);
 render(h(InjectionProgressSummary,{progress}),host);
 window.__removeUnfamiliarConcern=()=>{render(null,host);host.remove();};
};
