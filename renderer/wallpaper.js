// Snowy cabin wallpaper: night sky, mountains, pines, a cabin with warm windows and
// string lights, and a snowy pine branch. Drawn entirely with Canvas 2D.
//   Wallpaper.render(ctx, W, H)            -> paints the static scene (sizes in ctx units)
//   Wallpaper.animate(ctx, bgCanvas, t, dt) -> scene + twinkling stars, glowing lights, chimney smoke
(() => {
'use strict';
let W = 0, H = 0, world = null;
const rand = Math.random;
const lerp = (a,b,t)=>a+(b-a)*t;
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function ellipse(c,x,y,rx,ry,rot=0){c.beginPath();c.ellipse(x,y,Math.max(rx,.1),Math.max(ry,.1),rot,0,Math.PI*2);}

function pine(c,x,base,h,dark,snow,R){
  const tiers=Math.max(3,Math.min(7,Math.round(h/40)));
  const w=h*0.5;
  c.fillStyle=dark;c.fillRect(x-h*0.025,base-h*0.14,h*0.05,h*0.14);
  for(let t=tiers-1;t>=0;t--){
    const f=(t+1)/tiers;
    const top=base-h+t*h*0.78/tiers;
    const bot=top+h*0.26+t*h*0.012;
    const half=w/2*(0.28+0.72*f);
    c.beginPath();c.moveTo(x,top);c.lineTo(x+half,bot);
    const n=6;
    for(let j=1;j<n;j++){const xx=x+half-j*(2*half/n);c.lineTo(xx,bot-(j%2?h*0.035:0));}
    c.lineTo(x-half,bot);c.closePath();c.fillStyle=dark;c.fill();
    // snow on top of tier
    c.beginPath();c.moveTo(x,top-1);
    c.quadraticCurveTo(x+half*0.4,top+(bot-top)*0.35,x+half*0.98,bot-h*0.03);
    const m=5;
    for(let j=1;j<=m;j++){
      const xx=x+half*0.98-j*(2*half*0.98/m);
      const yy=bot-h*0.03-(bot-top)*(0.18+0.12*Math.sin(j*2.1+x))*(1-Math.abs(xx-x)/half*0.6);
      c.quadraticCurveTo(xx+half/m,yy+h*0.03,xx,yy);
    }
    c.quadraticCurveTo(x-half*0.4,top+(bot-top)*0.35,x,top-1);
    c.fillStyle=snow;c.fill();
  }
}

function drawBackground(c){
  const R=rng(20261117);
  const k=Math.min(H/900,W/620);
  const hz=H*0.62;
  world={bulbs:[],glows:[],twinkles:[],chimney:null,k};

  // sky
  let g=c.createLinearGradient(0,0,0,hz);
  g.addColorStop(0,'#050822');g.addColorStop(.5,'#111850');g.addColorStop(1,'#2c3488');
  c.fillStyle=g;c.fillRect(0,0,W,H);

  const farY=x=>{const u=x/W;return H*0.54-H*(0.035*Math.sin(u*7+1)+0.02*Math.sin(u*17+2)+0.01*Math.sin(u*41))
    -H*0.16*Math.exp(-(((u-0.74)/0.11)**2))-H*0.09*Math.exp(-(((u-0.4)/0.09)**2))-H*0.07*Math.exp(-(((u-0.96)/0.07)**2));};

  // stars
  c.fillStyle='#fff';
  const nStars=W*H/1500;
  for(let i=0;i<nStars;i++){
    const x=R()*W,y=R()*hz; if(y>farY(x))continue;
    const r=R()<.93?R()*.7+.25:R()*1.1+.8;
    c.globalAlpha=.25+R()*.65;c.beginPath();c.arc(x,y,r,0,7);c.fill();
  }
  c.globalAlpha=1;
  for(let i=0;i<90;i++){const x=R()*W,y=R()*hz*0.92;if(y<farY(x)-8)world.twinkles.push({x,y,r:R()*1.1+.7,p:R()*6.3,s:.6+R()*2.2});}

  // far mountains
  c.beginPath();c.moveTo(0,H);for(let x=0;x<=W+4;x+=4)c.lineTo(x,farY(x));c.lineTo(W,H);c.closePath();
  g=c.createLinearGradient(0,H*0.3,0,H*0.66);
  g.addColorStop(0,'#c3c4f4');g.addColorStop(.3,'#7d82d0');g.addColorStop(.7,'#3a418f');g.addColorStop(1,'#1f2566');
  c.fillStyle=g;c.fill();
  c.save();c.clip();
  for(let i=0;i<W/4;i++){
    const x=R()*W;let x1=x,y1=farY(x)+R()*6;const lean=(x/W<0.74?-1:1)*(0.3+R()*0.7);
    c.beginPath();c.moveTo(x1,y1);const len=(25+R()*110)*k;
    for(let s=0;s<7;s++){x1+=lean*len/7*0.6+(R()-.5)*6*k;y1+=len/7;c.lineTo(x1,y1);}
    c.strokeStyle=`rgba(22,26,80,${.18+R()*.35})`;c.lineWidth=(1+R()*3.5)*k;c.lineCap='round';c.stroke();
  }
  c.restore();

  // near range
  const nearY=x=>{const u=x/W;return H*0.615-H*(0.025*Math.sin(u*5+3)+0.015*Math.sin(u*13+1))-H*0.06*Math.exp(-(((u-0.62)/0.14)**2));};
  c.beginPath();c.moveTo(0,H);for(let x=0;x<=W+4;x+=4)c.lineTo(x,nearY(x));c.lineTo(W,H);c.closePath();
  g=c.createLinearGradient(0,H*0.5,0,H*0.68);g.addColorStop(0,'#5960b0');g.addColorStop(1,'#1a1f58');
  c.fillStyle=g;c.fill();
  // forest on near range
  for(let x=-10;x<W+10;x+=(5+R()*7)*k){
    const y=nearY(x)+R()*(H*0.67-nearY(x));
    pine(c,x,y,(16+R()*26)*k,'#12163f','#6f75c4',R);
  }

  // ground
  const groundY=x=>H*0.665+H*0.012*Math.sin(x/W*8+1);
  c.beginPath();c.moveTo(0,H);for(let x=0;x<=W+4;x+=6)c.lineTo(x,groundY(x));c.lineTo(W,H);c.closePath();
  g=c.createLinearGradient(0,H*0.65,0,H);g.addColorStop(0,'#6b6fc4');g.addColorStop(.45,'#8b8ad6');g.addColorStop(1,'#bcb6ee');
  c.fillStyle=g;c.fill();

  // cabin geometry
  const cx=Math.max(W*0.19,260*k), base=H*0.8;
  // warm spill on snow
  g=c.createRadialGradient(cx,base,10,cx,base,480*k);
  g.addColorStop(0,'rgba(255,170,95,.55)');g.addColorStop(.5,'rgba(255,140,90,.18)');g.addColorStop(1,'rgba(255,140,90,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H);

  // mid pines behind cabin
  const snowP='#aeb2ea';
  [[cx+250*k,base-20*k,360*k],[cx+380*k,base-60*k,250*k],[cx-250*k,base-40*k,300*k],[cx+120*k,base-140*k,220*k]].forEach(p=>pine(c,p[0],p[1],p[2],'#171c4c',snowP,R));
  // right side pines
  for(const [u,hh] of [[0.58,200],[0.66,150],[0.8,260],[0.9,190],[0.97,280],[0.5,120]]){
    const x=u*W;pine(c,x,groundY(x)+40*k+R()*30*k,hh*k,'#141946',snowP,R);
  }
  // ground sparkles
  for(let i=0;i<W*H/900;i++){const x=R()*W,y=H*0.67+R()*H*0.33;c.globalAlpha=R()*.5;c.fillStyle='#fff';c.fillRect(x,y,1,1);}
  c.globalAlpha=1;

  drawCabin(c,cx,base,k,R);

  // foreground drifts
  g=c.createLinearGradient(0,H*0.85,0,H);g.addColorStop(0,'#c9c6f3');g.addColorStop(1,'#8f8ed8');
  c.fillStyle=g;
  for(let i=0;i<9;i++){ellipse(c,(i/8)*W*0.6-40*k,H+20*k-R()*30*k,(120+R()*120)*k,(40+R()*30)*k);c.fill();}
  // bare shrub
  c.strokeStyle='#1d1530';c.lineCap='round';
  const shrub=(x,y,s)=>{for(let i=0;i<9;i++){c.lineWidth=(2.5-i*0.2)*k;c.beginPath();c.moveTo(x,y);
    const a=-Math.PI/2+(R()-.5)*1.8,l=(40+R()*50)*s*k;const ex=x+Math.cos(a)*l,ey=y+Math.sin(a)*l;
    c.quadraticCurveTo(x+Math.cos(a)*l*0.5+10*k,y+Math.sin(a)*l*0.5,ex,ey);c.stroke();
    c.fillStyle='#eef0ff';ellipse(c,ex,ey-1,3*k,2*k);c.fill();}};
  shrub(cx-170*k,H*0.93,1.2);shrub(W*0.05,H*0.9,0.9);

  drawBranch(c,k,R);

  // subtle vignette
  g=c.createRadialGradient(W/2,H*0.45,Math.min(W,H)*0.3,W/2,H*0.5,Math.max(W,H)*0.8);
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,20,.45)');c.fillStyle=g;c.fillRect(0,0,W,H);
}

function drawCabin(c,cx,base,k,R){
  const bw=380*k,wallH=140*k,roofH=250*k,over=55*k;
  const L=cx-bw/2,Rr=cx+bw/2,wallTop=base-wallH,peakY=wallTop-roofH;
  const m=roofH/(bw/2);
  const E1={x:L-over,y:wallTop+over*m*0.75},P={x:cx,y:peakY-8*k},E2={x:Rr+over,y:wallTop+over*m*0.75};
  const wood='#3d2415',woodD='#26150b',woodL='#5a3620';

  // back snow mound
  c.fillStyle='#9e9de2';ellipse(c,cx,base+4*k,bw*0.85,40*k);c.fill();

  // gable
  let g=c.createLinearGradient(0,peakY,0,wallTop);g.addColorStop(0,'#2f1a0e');g.addColorStop(1,wood);
  c.beginPath();c.moveTo(L,wallTop);c.lineTo(cx,peakY);c.lineTo(Rr,wallTop);c.closePath();c.fillStyle=g;c.fill();
  c.save();c.clip();c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1.5*k;
  for(let x=L;x<Rr;x+=17*k){c.beginPath();c.moveTo(x,peakY);c.lineTo(x,wallTop);c.stroke();}
  c.restore();
  // lower wall (logs)
  c.fillStyle=wood;c.fillRect(L,wallTop,bw,wallH);
  c.strokeStyle=woodD;c.lineWidth=2*k;
  for(let y=wallTop+12*k;y<base;y+=14*k){c.beginPath();c.moveTo(L,y);c.lineTo(Rr,y);c.stroke();}
  // log ends
  c.fillStyle=woodL;for(let y=wallTop+6*k;y<base-4*k;y+=14*k){ellipse(c,L-3*k,y,6*k,6*k);c.fill();ellipse(c,Rr+3*k,y,6*k,6*k);c.fill();}

  const glowWin=(x,y,w,h,panesX,panesY)=>{
    c.fillStyle=woodD;c.fillRect(x-6*k,y-6*k,w+12*k,h+12*k);
    const gg=c.createLinearGradient(0,y,0,y+h);gg.addColorStop(0,'#ffe9a8');gg.addColorStop(1,'#ff9e3a');
    c.fillStyle=gg;c.fillRect(x,y,w,h);
    // interior hint
    c.fillStyle='rgba(150,70,20,.35)';c.fillRect(x,y+h*0.7,w,h*0.3);
    c.fillStyle=woodD;
    for(let i=1;i<panesX;i++)c.fillRect(x+w*i/panesX-2*k,y,4*k,h);
    for(let i=1;i<panesY;i++)c.fillRect(x,y+h*i/panesY-2*k,w,4*k);
    // sill snow
    c.fillStyle='#eef0ff';c.beginPath();c.roundRect(x-9*k,y+h+4*k,w+18*k,7*k,4*k);c.fill();
    world.glows.push({x:x+w/2,y:y+h/2,r:Math.max(w,h)*1.4,p:R()*10});
  };
  // upper gable window
  glowWin(cx-40*k,peakY+108*k,80*k,95*k,2,3);
  // lower windows
  glowWin(L+28*k,wallTop+24*k,118*k,80*k,3,2);
  glowWin(Rr-146*k,wallTop+24*k,118*k,80*k,3,2);
  // door
  c.fillStyle=woodD;c.fillRect(cx-36*k,wallTop+16*k,72*k,wallH-40*k);
  c.fillStyle='#5b3418';c.fillRect(cx-30*k,wallTop+22*k,60*k,wallH-46*k);
  c.fillStyle='#ffc56b';c.fillRect(cx-18*k,wallTop+32*k,36*k,30*k);
  world.glows.push({x:cx,y:wallTop+47*k,r:70*k,p:R()*10});

  // chimney
  const q={x:lerp(E1.x,P.x,0.42),y:lerp(E1.y,P.y,0.42)};
  c.fillStyle='#4f4256';c.fillRect(q.x-20*k,q.y-80*k,40*k,100*k);
  c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1.2*k;
  for(let y=q.y-72*k;y<q.y+20*k;y+=10*k){c.beginPath();c.moveTo(q.x-20*k,y);c.lineTo(q.x+20*k,y);c.stroke();}
  c.fillStyle='#3a3042';c.fillRect(q.x-24*k,q.y-86*k,48*k,10*k);
  c.fillStyle='#eef0ff';ellipse(c,q.x,q.y-88*k,27*k,8*k);c.fill();
  world.chimney={x:q.x,y:q.y-92*k};

  // roof
  const roofSide=(A,B)=>{
    const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy),d={x:dx/len,y:dy/len};
    const n=dx>0&&dy<0?{x:d.y,y:-d.x}:{x:-d.y,y:d.x}; // upward normal
    const nUp=n.y<0?n:{x:-n.x,y:-n.y};
    // fascia
    c.strokeStyle='#22120a';c.lineWidth=18*k;c.lineCap='round';
    c.beginPath();c.moveTo(A.x,A.y);c.lineTo(B.x,B.y);c.stroke();
    // snow slab
    const N=18,top=[],bot=[];
    for(let i=0;i<=N;i++){const t=i/N;const px=lerp(A.x,B.x,t),py=lerp(A.y,B.y,t);
      const T=(30+10*Math.sin(i*1.7)+R()*6)*k;
      top.push({x:px+nUp.x*T,y:py+nUp.y*T});bot.push({x:px-nUp.x*5*k,y:py-nUp.y*5*k+(i%3===0?4*k:0)});}
    c.beginPath();c.moveTo(bot[0].x,bot[0].y);
    for(let i=1;i<=N;i++)c.lineTo(bot[i].x,bot[i].y);
    for(let i=N;i>=0;i--){const p=top[i],pn=top[Math.max(i-1,0)];c.quadraticCurveTo(p.x,p.y,(p.x+pn.x)/2,(p.y+pn.y)/2);}
    c.closePath();
    const gg=c.createLinearGradient(A.x+nUp.x*30*k,A.y+nUp.y*30*k,A.x,A.y);
    gg.addColorStop(0,'#ffffff');gg.addColorStop(.7,'#e3e5fd');gg.addColorStop(1,'#a9adec');
    c.fillStyle=gg;c.fill();
    c.strokeStyle='rgba(120,125,210,.8)';c.lineWidth=3*k;c.beginPath();c.moveTo(bot[0].x,bot[0].y);for(let i=1;i<=N;i++)c.lineTo(bot[i].x,bot[i].y);c.stroke();
    // string lights below the fascia
    for(let t=0.04;t<0.97;t+=22*k/len){
      const px=lerp(A.x,B.x,t)-nUp.x*14*k,py=lerp(A.y,B.y,t)-nUp.y*14*k+2*k*Math.sin(t*60);
      world.bulbs.push({x:px,y:py,p:R()*6.3,s:1+R()*2});
    }
  };
  roofSide(E1,P);roofSide(P,E2);
  c.fillStyle='#fff';ellipse(c,P.x,P.y-18*k,24*k,16*k);c.fill();
  c.fillStyle='#eef0ff';ellipse(c,E1.x-4*k,E1.y+4*k,18*k,13*k);c.fill();ellipse(c,E2.x+4*k,E2.y+4*k,18*k,13*k);c.fill();

  // porch beam + posts
  const posts=[L-12*k,cx-95*k,cx+95*k,Rr+12*k];
  c.fillStyle='#2a170c';c.fillRect(L-34*k,wallTop-2*k,bw+68*k,14*k);
  c.fillStyle='#eef0ff';c.beginPath();c.roundRect(L-38*k,wallTop-9*k,bw+76*k,9*k,5*k);c.fill();
  c.fillStyle='#3a2112';posts.forEach(x=>c.fillRect(x-6*k,wallTop+10*k,12*k,wallH-38*k));
  // beam lights with sag
  c.strokeStyle='#160c06';c.lineWidth=1.2*k;
  for(let s=0;s<posts.length-1;s++){
    const a=posts[s],b=posts[s+1],sag=16*k;
    c.beginPath();
    for(let u=0;u<=1.001;u+=0.05){const x=lerp(a,b,u),y=wallTop+14*k+sag*4*u*(1-u);u===0?c.moveTo(x,y):c.lineTo(x,y);}
    c.stroke();
    const n=Math.max(2,Math.round((b-a)/(20*k)));
    for(let i=1;i<n;i++){const u=i/n;world.bulbs.push({x:lerp(a,b,u),y:wallTop+17*k+sag*4*u*(1-u),p:R()*6.3,s:1+R()*2});}
  }
  // lanterns
  [posts[0],posts[3],cx-50*k].forEach((x,i)=>{
    const y=i<2?wallTop+42*k:wallTop+30*k;
    c.fillStyle='#1a0f08';c.fillRect(x-8*k,y-12*k,16*k,24*k);
    c.fillStyle='#ffd27a';c.fillRect(x-5*k,y-8*k,10*k,16*k);
    c.fillStyle='#1a0f08';c.beginPath();c.moveTo(x-10*k,y-12*k);c.lineTo(x,y-20*k);c.lineTo(x+10*k,y-12*k);c.fill();
    world.glows.push({x,y,r:46*k,p:R()*10,lantern:true});
  });

  // deck + railing
  const dL=L-34*k,dR=Rr+34*k,deckTop=base-28*k;
  c.fillStyle='#2b170c';c.fillRect(dL,deckTop,dR-dL,28*k);
  c.fillStyle='#4b2c18';c.fillRect(dL,deckTop,dR-dL,5*k);
  const railTop=base-72*k;
  c.fillStyle='#3a2112';
  for(const [a,b] of [[dL,cx-60*k],[cx+60*k,dR]]){
    c.fillRect(a,railTop,b-a,8*k);
    for(let x=a+4*k;x<b;x+=17*k)c.fillRect(x,railTop,5*k,deckTop-railTop);
    c.fillStyle='#eef0ff';c.beginPath();c.roundRect(a-3*k,railTop-7*k,b-a+6*k,9*k,4*k);c.fill();c.fillStyle='#3a2112';
  }
  // steps
  for(let i=0;i<3;i++){c.fillStyle=i%2?'#3a2112':'#4b2c18';c.fillRect(cx-58*k-i*6*k,deckTop+i*14*k,116*k+i*12*k,14*k);
    c.fillStyle='#eef0ff';c.fillRect(cx-58*k-i*6*k,deckTop+i*14*k-3*k,116*k+i*12*k,4*k);}
  // snow drifts along front
  for(let x=dL-60*k;x<dR+80*k;x+=26*k){
    if(Math.abs(x-cx)<70*k)continue;
    const gg=c.createLinearGradient(0,base-10*k,0,base+20*k);gg.addColorStop(0,'#f4f5ff');gg.addColorStop(1,'#a9a8e6');
    c.fillStyle=gg;ellipse(c,x,base+6*k,(26+R()*14)*k,(12+R()*8)*k);c.fill();
  }
  // static bulbs (dim) so they show even before glow
  world.bulbs.forEach(b=>{c.fillStyle='#ffcf70';c.beginPath();c.arc(b.x,b.y,2.4*k,0,7);c.fill();});
}

function drawBranch(c,k,R){
  const P0={x:-40*k,y:-20*k},C1={x:140*k,y:30*k},C2={x:260*k,y:60*k},P1={x:430*k,y:150*k};
  const bez=t=>{const u=1-t;return{x:u*u*u*P0.x+3*u*u*t*C1.x+3*u*t*t*C2.x+t*t*t*P1.x,y:u*u*u*P0.y+3*u*u*t*C1.y+3*u*t*t*C2.y+t*t*t*P1.y};};
  c.strokeStyle='#1b1228';c.lineCap='round';c.lineWidth=10*k;
  c.beginPath();c.moveTo(P0.x,P0.y);c.bezierCurveTo(C1.x,C1.y,C2.x,C2.y,P1.x,P1.y);c.stroke();
  const clump=(x,y,r,rot)=>{
    c.save();c.translate(x,y);c.rotate(rot);
    c.lineCap='round';
    // dark needle fan
    c.fillStyle='#1a1230';ellipse(c,0,r*0.22,r*0.85,r*0.32);c.fill();
    for(let i=0;i<34;i++){
      const a=-0.15*Math.PI+1.3*Math.PI*R(),l=r*(0.7+R()*0.5);
      c.strokeStyle=R()<.5?'#1a1230':'#2a1d40';c.lineWidth=(1.4+R()*1.4)*k;
      c.beginPath();c.moveTo(Math.cos(a)*r*0.2,r*0.15);c.lineTo(Math.cos(a)*l,r*0.15+Math.max(0,Math.sin(a))*l*0.75);c.stroke();
    }
    // warm lit underside needles (cabin light)
    for(let i=0;i<26;i++){
      const a=0.12*Math.PI+0.76*Math.PI*R(),l=r*(0.45+R()*0.55);
      c.strokeStyle=`rgba(${235+R()*20|0},${120+R()*50|0},${80+R()*30|0},${.55+R()*.4})`;c.lineWidth=(1+R()*1.3)*k;
      c.beginPath();c.moveTo(Math.cos(a)*r*0.15,r*0.25);c.lineTo(Math.cos(a)*l*1.1,r*0.25+Math.sin(a)*l*0.7);c.stroke();
    }
    // snow cap: one long soft slab + a couple of lumps
    const gg=c.createLinearGradient(0,-r*0.4,0,r*0.2);
    gg.addColorStop(0,'#ffffff');gg.addColorStop(.6,'#e2e4fc');gg.addColorStop(1,'#9ca0e4');
    c.fillStyle=gg;ellipse(c,0,-r*0.02,r*0.95,r*0.26);c.fill();
    for(let j=0;j<2;j++){ellipse(c,(j?0.35:-0.3)*r,-r*0.14,r*0.38,r*0.2);c.fill();}
    c.restore();
  };
  for(let i=0;i<=14;i++){const t=i/14,p=bez(t);clump(p.x,p.y+6*k,(60-t*24)*k,0.25+t*0.15);}
  // drooping sub-branches
  for(const t0 of [0.12,0.3,0.5,0.7,0.88]){
    const p=bez(t0);const L2=(120-t0*60)*k;
    c.lineWidth=5*k;c.strokeStyle='#1b1228';c.beginPath();c.moveTo(p.x,p.y);c.quadraticCurveTo(p.x+L2*0.6,p.y+L2*0.2,p.x+L2*0.8,p.y+L2);c.stroke();
    for(let i=0;i<=6;i++){const u=i/6;const x=lerp(p.x,p.x+L2*0.8,u)+Math.sin(u*3)*L2*0.15,y=lerp(p.y,p.y+L2,u*u*0.9+u*0.1);
      clump(x,y+8*k,(44-u*16)*k,0.5+u*0.6);}
  }
}

const smoke=[];let smokeT=0;
function noise(t,p){return 0.5*Math.sin(t*5.3+p)+0.3*Math.sin(t*11.7+p*2.3)+0.2*Math.sin(t*23.1+p*0.7);}
function drawScene(c,bg,t,dt){
  const k=world.k;
  c.drawImage(bg,0,0,W,H);
  // twinkling stars
  c.fillStyle='#fff';
  for(const s of world.twinkles){c.globalAlpha=0.25+0.75*(0.5+0.5*Math.sin(t*s.s+s.p));c.beginPath();c.arc(s.x,s.y,s.r,0,7);c.fill();}
  c.globalAlpha=1;
  // chimney smoke
  if(world.chimney){
    smokeT+=dt;while(smokeT>0.18){smokeT-=0.18;smoke.push({x:world.chimney.x+(rand()-.5)*8*k,y:world.chimney.y,r:7*k,a:0,life:0});}
    for(let i=smoke.length-1;i>=0;i--){const s=smoke[i];s.life+=dt;s.y-=22*k*dt;s.x+=(10+Math.sin(s.life*1.3+i)*8)*k*dt;s.r+=7*k*dt;
      const a=Math.min(1,s.life)*Math.max(0,1-s.life/6)*0.22;
      if(s.life>6){smoke.splice(i,1);continue;}
      const g=c.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r);g.addColorStop(0,`rgba(200,200,235,${a})`);g.addColorStop(1,'rgba(200,200,235,0)');
      c.fillStyle=g;c.fillRect(s.x-s.r,s.y-s.r,s.r*2,s.r*2);}
  }
  c.globalCompositeOperation='lighter';
  for(const g of world.glows){
    const f=0.82+0.18*noise(t,g.p)*(g.lantern?1.4:0.6);
    const gr=c.createRadialGradient(g.x,g.y,0,g.x,g.y,g.r);
    gr.addColorStop(0,`rgba(255,180,90,${0.38*f})`);gr.addColorStop(1,'rgba(255,140,60,0)');
    c.fillStyle=gr;c.fillRect(g.x-g.r,g.y-g.r,g.r*2,g.r*2);
  }
  for(const b of world.bulbs){
    const br=0.55+0.45*(0.5+0.5*Math.sin(t*b.s+b.p));
    const r=10*k;
    const gr=c.createRadialGradient(b.x,b.y,0,b.x,b.y,r);
    gr.addColorStop(0,`rgba(255,215,130,${0.55*br})`);gr.addColorStop(1,'rgba(255,170,80,0)');
    c.fillStyle=gr;c.fillRect(b.x-r,b.y-r,r*2,r*2);
    c.fillStyle=`rgba(255,246,210,${0.6+0.4*br})`;c.beginPath();c.arc(b.x,b.y,2.2*k,0,7);c.fill();
  }
  c.globalCompositeOperation='source-over';
}


window.Wallpaper = {
  render(c, w, h) { W = w; H = h; drawBackground(c); return world; },
  animate(c, bg, t, dt) { drawScene(c, bg, t, dt); },
};
})();
