// CloudFront Function (viewer-request): HTTP Basic Auth for /dashboard/*
// Publish via infra/phase4/setup-dashboard-basic-auth.sh (substitutes __BASIC_AUTH_VALUE__).
function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var expected = "__BASIC_AUTH_VALUE__";

    if (
        typeof headers.authorization === "undefined" ||
        headers.authorization.value !== expected
    ) {
        return {
            statusCode: 401,
            statusDescription: "Unauthorized",
            headers: {
                "www-authenticate": { value: 'Basic realm="Promo Dashboard"' },
                "cache-control": { value: "no-store" },
            },
        };
    }

    return request;
}
