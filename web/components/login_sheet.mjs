import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
var PROVIDERS = {
	kakao: ["카카오로 계속하기", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7S17 4 12 4z\" fill=\"#191919\"/></svg>"],
	google: ["구글로 계속하기", "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path fill=\"#EA4335\" d=\"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z\"/><path fill=\"#4285F4\" d=\"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.89 46.98 24.55Z\"/><path fill=\"#FBBC05\" d=\"M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z\"/><path fill=\"#34A853\" d=\"M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z\"/></svg>"],
	apple: ["Apple로 계속하기", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.38-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.83 2.62-3.3 2.65-1.44.03-1.91-.86-3.56-.86-1.64 0-2.16.83-3.53.89-1.42.05-2.5-1.42-3.41-2.73C2.8 17.26 1.39 12.36 3.3 9.05a5.3 5.3 0 0 1 4.49-2.72c1.4-.03 2.72.94 3.56.94.83 0 2.4-1.16 4.04-.99.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.3 4.15ZM14.35 4.5c.76-.92 1.28-2.2 1.14-3.48-1.1.04-2.44.74-3.23 1.66-.7.81-1.32 2.11-1.15 3.35 1.23.1 2.48-.63 3.24-1.53Z\"/></svg>"]
};
var SocialButtons = ({ providers }) => /* @__PURE__ */ a(M, { children: providers.filter((provider) => PROVIDERS[provider]).map((provider) => {
	const [name, icon] = PROVIDERS[provider];
	return /* @__PURE__ */ a("a", {
		class: `social ${provider}`,
		href: `./api/auth/${provider}/start`,
		dangerouslySetInnerHTML: { __html: `${icon}<span>${name}</span>` }
	});
}) });
var LoginSheetBody = ({ message, children }) => /* @__PURE__ */ a(M, { children: [
	/* @__PURE__ */ a("img", {
		class: "login-brand",
		src: "./brand/syung-light.svg",
		alt: "",
		width: 47,
		height: 47
	}),
	/* @__PURE__ */ a("h2", {
		id: "loginTitle",
		children: "로그인"
	}),
	/* @__PURE__ */ a("div", {
		id: "accountProviders",
		class: "login-list",
		children
	}),
	/* @__PURE__ */ a("a", {
		class: "login-privacy",
		href: "./privacy.html",
		target: "_blank",
		rel: "noopener",
		children: "개인정보처리방침"
	}),
	/* @__PURE__ */ a("p", {
		id: "loginMsg",
		class: "login-msg",
		role: "status",
		"aria-live": "polite",
		children: message
	})
] });
export { LoginSheetBody, SocialButtons };
