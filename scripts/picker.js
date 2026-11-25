// 설치 도우미 공용: 한 줄씩 묻기. 팀원 설치(setup-collector)와 관리자 설치(setup-hub)가 같이 쓴다.
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

// Lines are queued rather than read with question(): a fast paste of several
// lines (or piped input) would otherwise lose everything after the first answer.
const rl = readline.createInterface({ input, terminal: false });
const lines = rl[Symbol.asyncIterator]();

export async function ask(q, fallback = '') {
  output.write(q);
  const { value, done } = await lines.next();
  if (done) throw new Error('입력이 끝났습니다');
  return value.trim() || fallback;
}

export function closePrompt() {
  rl.close();
}
