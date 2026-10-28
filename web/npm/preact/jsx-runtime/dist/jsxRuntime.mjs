import { Fragment as M, options as n$1 } from "../../dist/preact.mjs";
// node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs
var e = /["&<]/;
function n(r) {
	if (!r.length || !e.test(r)) return r;
	for (var t = 0, n = 0, f = "", o = ""; n < r.length; n++) {
		switch (r.charCodeAt(n)) {
			case 34:
				o = "&quot;";
				break;
			case 38:
				o = "&amp;";
				break;
			case 60:
				o = "&lt;";
				break;
			default: continue;
		}
		n != t && (f += r.slice(t, n)), f += o, t = n + 1;
	}
	return n != t && (f += r.slice(t, n)), f;
}
var f = Symbol.for("pv");
var o = 0;
var u = Array.isArray;
function a(t, e, n, u, a, i) {
	e || (e = {});
	var c, l, p = e;
	if ("ref" in p && "function" != typeof t) for (l in p = {}, e) "ref" == l ? c = e[l] : p[l] = e[l];
	var s = {
		type: t,
		props: p,
		key: n,
		ref: c,
		__k: null,
		__: null,
		__b: 0,
		__e: null,
		__c: null,
		constructor: f,
		__v: --o,
		__i: -1,
		__u: 0
	};
	return (a || i) && (s.__source = a, s.__self = i), n$1.vnode && n$1.vnode(s), s;
}
function i(r) {
	var e = a(M, {
		tpl: r,
		exprs: [].slice.call(arguments, 1)
	});
	return e.key = e.__v, e;
}
var c = {};
var l = /[A-Z]/g;
function p(t, e) {
	if (n$1.attr) {
		var f = n$1.attr(t, e);
		if ("string" == typeof f) return f;
	}
	if (e = function(r) {
		return null != r && "object" == typeof r && "function" == typeof r.valueOf ? r.valueOf() : r;
	}(e), "ref" == t || "key" == t) return "";
	if ("style" == t && "object" == typeof e) {
		var o = "";
		for (var u in e) {
			var a = e[u];
			null != a && "" !== a && (o = o + ("-" == u[0] ? u : c[u] || (c[u] = u.replace(l, "-$&").toLowerCase())) + ":" + a + ";");
		}
		return t + "=\"" + n(o) + "\"";
	}
	return null == e || !1 === e || "function" == typeof e || "object" == typeof e ? "" : !0 === e ? t : t + "=\"" + n("" + e) + "\"";
}
function s(r) {
	if (null == r || "boolean" == typeof r || "function" == typeof r) return null;
	if ("object" == typeof r) {
		if (r.constructor === f) return r;
		if (u(r)) {
			for (var t = 0; t < r.length; t++) r[t] = s(r[t]);
			return r;
		}
	}
	return n("" + r);
}
export { M as Fragment, a as jsx, a as jsxDEV, a as jsxs, p as jsxAttr, s as jsxEscape, i as jsxTemplate };
