// 로그인 칸(웹 #loginSheet 와 같은 모양 · 내용 — 손잡이 · 로고 · 제목 · 켜진 제공자 단추 · 개인정보처리방침 · 안내 한 줄).
// 켜진 제공자는 GET /api/auth/providers(토큰 없이). 단추를 누르면 시스템 브라우저 → syung://login 으로 돌아와 끝난다(login.ts).
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SERVER_ORIGIN } from '../config';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { call, isRecord } from './api';
import { AppleIcon, GoogleIcon, KakaoIcon } from './icons';
import { size, social } from './literals';
import { LoginLogo } from './LoginMotion';
import { dropReturnNotice, isProvider, LOGIN_FAILED, PROVIDER_LABELS, readReturnNotice, type Provider } from './login';
import { signIn } from './session';
import { body, makeStyles, round } from './style';

type Providers = { status: 'loading' } | { status: 'error' } | { status: 'ready'; list: Provider[] };

async function fetchProviders(): Promise<Providers> {
  try {
    const reply = await call('GET', '/api/auth/providers', undefined, { auth: false });
    const list = isRecord(reply.body) && Array.isArray(reply.body.providers) ? reply.body.providers.filter(isProvider) : null;
    return list ? { status: 'ready', list } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

const useStyles = makeStyles(theme => ({
  wrap: { alignItems: 'center' },
  title: { ...round(theme, size.loginTitle), marginBottom: 23 },
  list: { gap: 9, width: '100%' },
  social: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space[2], minHeight: 48, borderRadius: tokens.radius[12] },
  socialText: body(theme, tokens.text[13], tokens.weight.semibold),
  pressed: { opacity: 0.8 },
  dim: { opacity: 0.5 },
  privacy: { ...body(theme, tokens.text[11], tokens.weight.regular, theme.color.muted), marginTop: 14, textDecorationLine: 'underline' },
  message: { ...body(theme, tokens.text[12], tokens.weight.regular, theme.color.secondary), marginTop: 10, textAlign: 'center' },
  retry: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: tokens.radius[12], backgroundColor: theme.color.control },
  retryText: body(theme, tokens.text[13], tokens.weight.semibold),
}));

const ICONS: Record<Provider, typeof KakaoIcon> = { kakao: KakaoIcon, google: GoogleIcon, apple: AppleIcon };

export function LoginPanel() {
  const styles = useStyles();
  const theme = useTheme();
  const [providers, setProviders] = useState<Providers>({ status: 'loading' });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(() => {
    const notice = readReturnNotice();
    return notice ? { text: notice, error: true } : null;
  });

  const retry = () => {
    setProviders({ status: 'loading' });
    void fetchProviders().then(setProviders);
  };
  useEffect(() => {
    let alive = true;
    void fetchProviders().then(next => { if (alive) setProviders(next); });
    return () => { alive = false; };
  }, []);
  useEffect(dropReturnNotice, []);

  const press = async (provider: Provider) => {
    if (busy) return;
    setBusy(provider);
    setMessage(null);
    try {
      setMessage(await signIn(provider));
    } catch {   // 토큰 저장 실패 등
      setMessage({ text: LOGIN_FAILED, error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <LoginLogo />
      <Text style={styles.title} accessibilityRole="header">로그인</Text>
      {providers.status === 'loading' && <ActivityIndicator color={theme.color.ink} />}
      {providers.status === 'error' && (
        <View style={styles.list}>
          <Text style={styles.message}>로그인 방법을 받지 못했어요. 연결을 확인해 주세요.</Text>
          <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable>
        </View>
      )}
      {providers.status === 'ready' && (
        <View style={styles.list}>
          {providers.list.length === 0 && <Text style={styles.message}>지금은 로그인을 쓸 수 없어요.</Text>}
          {providers.list.map(provider => {
            const look = social[provider];
            const Icon = ICONS[provider];
            const shadow = provider === 'apple' && theme.name === 'dark' ? social.appleDarkShadow : look.shadow;
            return (
              <Pressable key={provider} onPress={() => void press(provider)} disabled={busy !== null} accessibilityRole="button"
                accessibilityState={{ disabled: busy !== null, busy: busy === provider }}
                style={({ pressed }) => [styles.social, { backgroundColor: look.back }, shadow ? { boxShadow: shadow } : null, pressed && styles.pressed, busy !== null && busy !== provider && styles.dim]}>
                {busy === provider ? <ActivityIndicator color={look.ink} /> : <><Icon /><Text style={[styles.socialText, { color: look.ink }]}>{PROVIDER_LABELS[provider]}</Text></>}
              </Pressable>
            );
          })}
        </View>
      )}
      <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${SERVER_ORIGIN}/privacy.html`)} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.privacy}>개인정보처리방침</Text>
      </Pressable>
      {message && <Text style={styles.message} accessibilityLiveRegion="polite">{message.text}</Text>}
    </View>
  );
}
