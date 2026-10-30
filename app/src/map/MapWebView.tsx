// 웹 지도를 띄우는 웹뷰 하나 + 다리(bridge.ts). 화면은 이 컴포넌트에 명령을 보내고(ref.send) 지도 메시지를 onMessage 로 받는다.
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { AppState, Linking, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { parseMapMessage, type AppCommand, type MapMessage } from './bridge';
import { MAP_ORIGIN, MAP_URL, startMapServer } from './source';

export interface MapWebViewHandle {
  send(command: AppCommand): void;
  reload(): void;
}

interface Props {
  ref?: Ref<MapWebViewHandle>;
  onMessage(message: MapMessage): void;
  // 지도 페이지가 처음부터 다시 뜬다(웹뷰 프로세스가 죽어 다시 띄움 · 다시 시도) — ready 를 다시 기다린다
  onReloading(): void;
  onLoadFailed(message: string): void;
}

// 지도 페이지 밖으로 가는 이동(지도 출처 · 저작권 링크 등)은 웹뷰 안에서 열지 않고 시스템 브라우저로
function allowNavigation(request: ShouldStartLoadRequest): boolean {
  const { url } = request;
  if (url.startsWith(`${MAP_ORIGIN}/`) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (request.isTopFrame === false) return true;
  if (/^https?:/i.test(url)) Linking.openURL(url).catch(() => undefined);
  return false;
}

export function MapWebView({ ref, onMessage, onReloading, onLoadFailed }: Props) {
  // 패키지 타입의 기본 P=undefined 는 props 를 never 로 만든다(WebViewProps & undefined) — 빈 객체로 연다
  const webView = useRef<WebView<object>>(null);
  // 앱 안 지도 서버가 뜬 뒤에만 웹뷰를 연다
  const [serving, setServing] = useState(false);

  const alive = useRef(true);
  // 이미 떠 있으면 바로 끝난다 — 처음 · 앱 복귀 · 다시 열기 때 부른다
  const serve = useCallback(() => {
    startMapServer().then(
      () => { if (alive.current) setServing(true); },
      (error: unknown) => { if (alive.current) onLoadFailed(error instanceof Error ? error.message : '지도를 열지 못했어요.'); },
    );
  }, [onLoadFailed]);

  useEffect(() => {
    alive.current = true;
    serve();
    // 앱이 쉬는 동안 시스템이 서버를 닫았을 수 있다 — 돌아오면 다시 띄운다
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') serve(); });
    return () => { alive.current = false; subscription.remove(); };
  }, [serve]);

  useImperativeHandle(ref, () => ({
    send(command) { webView.current?.postMessage(JSON.stringify(command)); },
    // 서버가 못 떠 웹뷰가 아직 없으면 서버부터 다시
    reload() { onReloading(); serve(); webView.current?.reload(); },
  }), [onReloading, serve]);

  // 백그라운드에서 웹뷰 프로세스가 죽으면(메모리 부족) 화면이 하얗게 남는다 — 다시 띄운다
  const restart = () => { onReloading(); webView.current?.reload(); };

  if (!serving) return null;

  return (
    <WebView<object>
      ref={webView}
      style={styles.web}
      source={{ uri: MAP_URL }}
      originWhitelist={['*']}
      domStorageEnabled
      geolocationEnabled
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      allowsLinkPreview={false}
      textInteractionEnabled={false}
      webviewDebuggingEnabled={__DEV__}
      onShouldStartLoadWithRequest={allowNavigation}
      onMessage={(event) => {
        const message = parseMapMessage(event.nativeEvent.data);
        if (message) onMessage(message);
        else if (__DEV__) console.warn('지도 메시지 모양이 계약과 다르다', event.nativeEvent.data);
      }}
      onError={(event) => onLoadFailed(event.nativeEvent.description || '지도를 열지 못했어요.')}
      onContentProcessDidTerminate={restart}
      onRenderProcessGone={restart}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
