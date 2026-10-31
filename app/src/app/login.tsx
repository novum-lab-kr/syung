// 로그인에서 돌아오는 딥링크 syung://login?code=… · ?error=…(계획서 8절). 보통은 시스템 브라우저 결과(openAuthSessionAsync)가 먼저 받아 끝내고,
// Expo Router 가 이 주소를 화면으로도 열면(Android 등) 여기서 같은 바꾸기를 기다린 뒤 내 정보로 넘어간다 — 코드 바꾸기는 한 번만(login.ts).
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { finishLogin, LOGIN_FAILED } from '../account/login';
import { applyLogin } from '../account/session';
import { showToast } from '../account/toast';

export default function LoginReturn() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  useEffect(() => {
    const back = { ...(params.code ? { code: params.code } : {}), ...(params.error ? { error: params.error } : {}) };
    const done = finishLogin(back);
    if (!done) return;
    void done.then(applyLogin).then(message => { if (message) showToast(message.text, message.error); }).catch(() => showToast(LOGIN_FAILED, true));
  }, [params.code, params.error]);
  return <Redirect href="/account" />;
}
