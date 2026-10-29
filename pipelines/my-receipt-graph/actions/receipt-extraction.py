import base64, json, re
import httpx2

URL = 'http://localhost:4000/openai/v1/responses'
MODEL = 'gpt-5.4-mini'
PROMPT = (
    'Read this receipt photo and return ONLY minified JSON, no prose, no code fences, with this shape: '
    '{"merchant":{"name":"","address":"","city":"","state":"","phone":""},'
    '"receipt":{"order_number":"","date":"","subtotal":"","tax":"","total":"","payment_method":""},'
    '"items":[{"name":"","quantity":"","price":""}]}. '
    'Rules: transcribe only what is printed on the receipt; use "" for anything not shown; never guess. '
    'Merchant name is the business name at the top. Items are purchased products/dishes/drinks only '
    '(not subtotal, tax, total, tips, modifiers like "no cheese", or handwriting). Numbers as plain strings without currency symbols. '
    'Date as printed.'
)
_client = None

def _session():
    global _client
    if _client is None:
        _client = httpx2.AsyncClient()
    return _client

def _out(row, js, err):
    return {'resource_id': row['resource_id'] or '', 'document': row['document'] or '', 'extraction_json': js, 'model_error': err}

async def transform_row(row):
    content = row['content']
    if not content:
        return _out(row, '', 'no image bytes')
    b64 = base64.b64encode(content).decode()
    payload = {'model': MODEL, 'input': [{'role': 'user', 'content': [
        {'type': 'input_text', 'text': PROMPT},
        {'type': 'input_image', 'image_url': 'data:image/jpeg;base64,' + b64}]}]}
    last = ''
    for attempt in range(3):
        try:
            r = await _session().post(URL, json=payload, headers={'X-Corvic-Room-Id': '5'}, timeout=180)
            if r.status_code in (408, 409, 429, 500, 502, 503, 504):
                last = 'http %d' % r.status_code
                continue
            if r.status_code != 200:
                return _out(row, '', 'http %d: %s' % (r.status_code, r.text[:200]))
            text = ''
            for item in r.json().get('output', []):
                for c in item.get('content', []) or []:
                    if c.get('type') == 'output_text':
                        text += c.get('text', '')
            m = re.search(r'\{.*\}', text, re.S)
            if not m:
                return _out(row, '', 'unparsable answer')
            json.loads(m.group(0))
            return _out(row, m.group(0), '')
        except (httpx2.HTTPError, ValueError) as e:
            last = type(e).__name__
    return _out(row, '', last)
