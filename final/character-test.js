const walker = document.querySelector('#walker');
const shadow = document.querySelector('#shadow');
const toggle = document.querySelector('#toggle');

let running = true;
let elapsed = 0;
let lastTime = performance.now();
let parts = null;
let layeredPhase = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rotatePart(element, angle, x, y) {
  element.setAttribute('transform', `rotate(${angle.toFixed(2)} ${x} ${y})`);
}

function setLimbLayers(phaseIsPositive) {
  if (layeredPhase === phaseIsPositive || !parts) return;
  layeredPhase = phaseIsPositive;

  // 전진한 팔과 반대쪽 다리는 몸통 앞에, 후퇴한 팔다리는 몸통 뒤에 놓는다.
  const behind = phaseIsPositive
    ? [parts.leftArm, parts.rightLeg]
    : [parts.rightArm, parts.leftLeg];
  const inFront = phaseIsPositive
    ? [parts.rightArm, parts.leftLeg]
    : [parts.leftArm, parts.rightLeg];

  behind.forEach(part => parts.svg.appendChild(part));
  parts.svg.appendChild(parts.body);
  inFront.forEach(part => parts.svg.appendChild(part));
}

function loadCharacter() {
  const svg = walker.querySelector('svg');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('aria-hidden', 'true');

  parts = {
    svg,
    rightArm: svg.querySelector('#right_arm'),
    leftArm: svg.querySelector('#left_arm'),
    rightLeg: svg.querySelector('#right_leg'),
    leftLeg: svg.querySelector('#left_leg'),
    body: svg.querySelector('#body'),
  };

  if (Object.values(parts).some(part => !part)) throw new Error('필요한 신체 파트 ID가 없습니다.');
}

function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;
  if (running) elapsed += dt;

  const duration = 8.5;
  const progress = (elapsed % duration) / duration;
  const eased = progress * progress * (3 - 2 * progress);
  const start = { x: innerWidth * 0.15, y: innerHeight * 0.11 };
  const end = { x: innerWidth * 0.76, y: innerHeight * 0.68 };
  const x = start.x + (end.x - start.x) * eased;
  const y = start.y + (end.y - start.y) * eased;

  // 실제 이동 속도에 가까운 구간에서 보폭이 커지고 시작·끝에서는 작아진다.
  const speedEnvelope = clamp(Math.sin(progress * Math.PI) * 1.35, 0, 1);
  const phase = elapsed * 7.4;
  const swing = Math.sin(phase) * 19 * speedEnvelope;
  const bob = Math.abs(Math.sin(phase)) * 2.4 * speedEnvelope;
  const lean = 2.5 * speedEnvelope;
  const perspectiveScale = 0.82 + eased * 0.30;

  walker.style.transform = `translate(${x}px, ${y - bob}px) scale(${perspectiveScale}) rotate(${lean}deg)`;
  shadow.style.transform = `translate(${x + 16}px, ${y + walker.offsetHeight * perspectiveScale - 5}px) scale(${perspectiveScale * (1 - bob * 0.025)}) rotate(-25deg)`;

  if (parts) {
    // 그림 자체가 좌우로 벌어진 자세라 같은 회전 방향을 줘야 화면에서 실제로 교차한다.
    // 팔과 다리는 서로 반대 위상이며, 반주기마다 앞뒤 레이어도 교체한다.
    setLimbLayers(swing >= 0);
    rotatePart(parts.rightArm, swing * 0.82, 105, 128);
    rotatePart(parts.leftArm, swing * 0.82, 205, 150);
    rotatePart(parts.rightLeg, -swing, 142, 326);
    rotatePart(parts.leftLeg, -swing, 158, 326);
    parts.body.setAttribute('transform', `translate(0 ${(-bob * 0.18).toFixed(2)})`);
  }

  requestAnimationFrame(animate);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? '일시정지' : '계속하기';
});

try {
  loadCharacter();
  requestAnimationFrame(animate);
} catch (error) {
  document.querySelector('#status').textContent = error.message;
  console.error(error);
}
