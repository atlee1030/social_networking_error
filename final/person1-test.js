const walker = document.querySelector('#walker');
const frame = document.querySelector('#frame');
const sheet = document.querySelector('#sheet');
const shadow = document.querySelector('#shadow');
const toggle = document.querySelector('#toggle');

// Illustrator 원본 안에서 각 자세가 시작되는 X 좌표와 실제 폭.
const poses = [
  { x: 0, width: 101 },
  { x: 322, width: 96 },
  { x: 643, width: 96 },
  { x: 972, width: 84 },
  { x: 1293, width: 74 },
  { x: 1600, width: 106 },
  { x: 1910, width: 116 },
  { x: 2250, width: 96 },
];
const frameSequence = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];

const sourceHeight = 242.74;
const renderedHeight = 142;
const sourceScale = renderedHeight / sourceHeight;
const stepDistance = 13.5;

let running = true;
let distance = 0;
let lastTime = performance.now();
let sheetReady = false;

sheet.addEventListener('load', () => {
  sheetReady = true;
  sheet.style.width = `${2345.64 * sourceScale}px`;
});

function setPose(index) {
  const pose = poses[index];
  const visibleWidth = Math.max(48, pose.width * sourceScale + 8);
  frame.style.width = `${visibleWidth}px`;
  sheet.style.left = `${-pose.x * sourceScale + 4}px`;
}

function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;

  const viewportDiagonal = Math.hypot(innerWidth, innerHeight);
  const speed = Math.max(62, viewportDiagonal * 0.052);
  if (running) distance += speed * dt;

  const routeLength = Math.hypot(innerWidth * 0.76, innerHeight * 0.72);
  const loopPadding = 180;
  const routeDistance = distance % (routeLength + loopPadding);
  const progress = Math.min(1, routeDistance / routeLength);
  const startX = innerWidth * 0.08;
  const startY = innerHeight * 0.04;
  const x = startX + innerWidth * 0.76 * progress;
  const y = startY + innerHeight * 0.72 * progress;

  // 보행 프레임은 시간이 아니라 실제 이동 거리에 맞춘다. 속도가 바뀌어도 발이 덜 미끄러진다.
  const sequenceIndex = Math.floor(distance / stepDistance) % frameSequence.length;
  const poseIndex = frameSequence[sequenceIndex];
  const phase = (distance / stepDistance) * Math.PI;
  const bob = Math.abs(Math.sin(phase)) * 1.5;
  const sway = Math.sin(phase * 0.5) * 0.7;
  const perspective = 0.76 + progress * 0.25;

  if (sheetReady) setPose(poseIndex);
  walker.style.transform = `translate(${x}px, ${y - bob}px) scale(${perspective}) rotate(${sway}deg)`;
  shadow.style.transform = `translate(${x - 18}px, ${y + renderedHeight * perspective - 4}px) scale(${perspective * (1 - bob * 0.025)}) rotate(-24deg)`;

  requestAnimationFrame(animate);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? '일시정지' : '계속하기';
});

setPose(0);
requestAnimationFrame(animate);
