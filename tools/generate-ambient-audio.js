/* eslint-disable no-bitwise */
'use strict';

// 外部音源に依存せず、同じループ素材を何度でも再生成できるようにする。
// 24 kHz / mono / 16-bit WAV。環境音には十分な帯域を保ちつつ、PWA の容量を抑える。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RATE = 24000;
const SECONDS = 24;
const CROSSFADE_SECONDS = 2;
const LENGTH = RATE * SECONDS;
const FADE = RATE * CROSSFADE_SECONDS;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'audio');

function mulberry32(seed){
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeBuffer(){ return new Float64Array(LENGTH + FADE); }
function white(rng){ return rng() * 2 - 1; }

function addPink(out, rng, gain){
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<out.length;i++){
    const w = white(rng);
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.96900*b2+w*0.1538520;
    b3=0.86650*b3+w*0.3104856; b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    out[i] += (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * gain;
    b6 = w*0.115926;
  }
}

function addBrown(out, rng, gain){
  let last = 0;
  for(let i=0;i<out.length;i++){
    last = (last + 0.018*white(rng)) / 1.018;
    out[i] += last * gain;
  }
}

function addTone(out, hz, gain, wobbleHz=0, wobbleDepth=0){
  let phase = 0;
  for(let i=0;i<out.length;i++){
    const t = i/RATE;
    const wobble = wobbleHz ? 1 + Math.sin(2*Math.PI*wobbleHz*t)*wobbleDepth : 1;
    phase += 2*Math.PI*hz*wobble/RATE;
    out[i] += Math.sin(phase) * gain;
  }
}

function addCrackle(out, rng, start, length, gain, bright=true){
  let lp = 0, previous = 0;
  for(let j=0;j<length && start+j<out.length;j++){
    const envelope = Math.exp(-7*j/length) * Math.sin(Math.PI*Math.min(1,j/(length*0.18)));
    const w = white(rng);
    lp += (w-lp) * 0.32;
    const signal = bright ? w-lp*0.72-previous*0.18 : lp;
    previous = w;
    out[start+j] += signal * envelope * gain;
  }
}

function rain(){
  const rng = mulberry32(0x5241494e), out = makeBuffer();
  addPink(out, rng, 0.030);
  let previous = 0;
  for(let i=0;i<out.length;i++){
    const w=white(rng); out[i] += (w-previous*0.72)*0.055; previous=w;
  }
  for(let t=0;t<SECONDS+CROSSFADE_SECONDS;t+=0.035+rng()*0.18){
    addCrackle(out,rng,Math.floor(t*RATE),Math.floor((0.018+rng()*0.07)*RATE),0.12+rng()*0.24,true);
  }
  return out;
}

function fan(){
  const rng = mulberry32(0x46414e21), out = makeBuffer();
  addBrown(out,rng,1.55); addPink(out,rng,0.014);
  addTone(out,54,0.105,0.08,0.018); addTone(out,108,0.045,0.08,0.012); addTone(out,162,0.018);
  for(let i=0;i<out.length;i++) out[i] *= 0.90 + 0.10*Math.sin(2*Math.PI*0.17*i/RATE);
  return out;
}

function waves(){
  const rng = mulberry32(0x57415645), out = makeBuffer();
  const carrier = makeBuffer(); addPink(carrier,rng,0.040); addBrown(carrier,rng,1.15);
  for(let i=0;i<out.length;i++){
    const t=i/RATE;
    const swell=Math.pow(0.5+0.5*Math.sin(2*Math.PI*t/8-1.15),1.7);
    const ripple=0.88+0.12*Math.sin(2*Math.PI*t/2.67+0.6);
    out[i]=carrier[i]*(0.25+0.88*swell)*ripple;
  }
  return out;
}

function train(){
  const rng = mulberry32(0x54524149), out = makeBuffer();
  addBrown(out,rng,1.65); addPink(out,rng,0.012);
  addTone(out,41,0.095,0.11,0.025); addTone(out,82,0.038,0.11,0.018);
  for(let t=0.15;t<SECONDS+CROSSFADE_SECONDS;t+=0.61){
    addCrackle(out,rng,Math.floor((t+(rng()-0.5)*0.025)*RATE),Math.floor(0.075*RATE),0.20,false);
    addCrackle(out,rng,Math.floor((t+0.105)*RATE),Math.floor(0.045*RATE),0.11,false);
  }
  for(let i=0;i<out.length;i++) out[i] *= 0.91+0.09*Math.sin(2*Math.PI*0.21*i/RATE);
  return out;
}

function fire(){
  const rng = mulberry32(0x46495245), out = makeBuffer();
  addBrown(out,rng,0.78); addPink(out,rng,0.012);
  for(let t=0.1;t<SECONDS+CROSSFADE_SECONDS;t+=0.10+rng()*0.55){
    const large=rng()>0.72;
    addCrackle(out,rng,Math.floor(t*RATE),Math.floor((large?0.09+rng()*0.18:0.025+rng()*0.07)*RATE),large?0.55:0.30,true);
  }
  return out;
}

function finishLoop(source){
  const out = new Float64Array(LENGTH);
  for(let i=0;i<FADE;i++){
    const t=i/FADE;
    out[i]=source[i]*t + source[LENGTH+i]*(1-t);
  }
  out.set(source.subarray(FADE,LENGTH),FADE);
  let peak=0;
  for(let i=0;i<out.length;i++){
    out[i]=Math.tanh(out[i]*1.15);
    peak=Math.max(peak,Math.abs(out[i]));
  }
  const scale=peak ? 0.82/peak : 1;
  for(let i=0;i<out.length;i++) out[i]*=scale;
  return out;
}

function wav(samples){
  const buffer=Buffer.alloc(44+samples.length*2);
  buffer.write('RIFF',0); buffer.writeUInt32LE(36+samples.length*2,4); buffer.write('WAVE',8);
  buffer.write('fmt ',12); buffer.writeUInt32LE(16,16); buffer.writeUInt16LE(1,20); buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(RATE,24); buffer.writeUInt32LE(RATE*2,28); buffer.writeUInt16LE(2,32); buffer.writeUInt16LE(16,34);
  buffer.write('data',36); buffer.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++) buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return buffer;
}

const sounds={rain,fan,waves,train,fire};
fs.mkdirSync(OUTPUT_DIR,{recursive:true});
for(const [name,generate] of Object.entries(sounds)){
  const data=wav(finishLoop(generate()));
  const file=path.join(OUTPUT_DIR,`${name}.wav`);
  fs.writeFileSync(file,data);
  const hash=crypto.createHash('sha256').update(data).digest('hex').slice(0,12);
  console.log(`${name}.wav  ${(data.length/1024/1024).toFixed(2)} MiB  sha256:${hash}`);
}
