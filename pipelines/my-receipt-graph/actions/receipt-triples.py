import json, re, sys

STRIP = {'inc', 'llc', 'ltd', 'co', 'corp'}
COLS = ['chunk_id','start_id','start_type','start_name','start_of','edge_type','edge_of','end_id','end_type','end_name','end_of']

def _norm(s):
    s = re.sub(r'[^a-z0-9 ]+', ' ', (s or '').casefold())
    toks = [t for t in s.split() if t not in STRIP]
    return ' '.join(toks)

def _s(v):
    return '' if v is None else str(v).strip()

def _row(cid, st, sid, sn, sof, et, eof, et_id, et_type, en, eo):
    return dict(zip(COLS, [cid, sid, st, sn, json.dumps(sof), et, json.dumps(eof), et_id, et_type, en, json.dumps(eo)]))

def transform_row(row):
    raw = row.get('extraction_json') or ''
    if not raw:
        print('empty extraction', file=sys.stderr)
        return None
    try:
        d = json.loads(raw)
    except Exception:
        print('unparsed', file=sys.stderr)
        return None
    cid = _s(row.get('resource_id'))
    m = d.get('merchant') or {}
    r = d.get('receipt') or {}
    rid = 'Receipt:' + cid
    rname = 'Receipt ' + (_s(r.get('order_number')) or _s(row.get('document')))
    rof = {k: _s(r.get(k)) for k in ['order_number','date','subtotal','tax','total','payment_method']}
    rof['document'] = _s(row.get('document'))
    out = []
    mname = _s(m.get('name'))
    mkey = _norm(mname)
    if mkey:
        mid = 'Merchant:' + mkey
        mof = {k: _s(m.get(k)) for k in ['address','phone']}
        out.append(_row(cid, 'Receipt', rid, rname, rof, 'ISSUED_BY', {}, mid, 'Merchant', mname, mof))
        ckey = _norm(_s(m.get('city')) + ' ' + _s(m.get('state')))
        if ckey:
            cname = (_s(m.get('city')) + (', ' + _s(m.get('state')) if _s(m.get('state')) else ''))
            out.append(_row(cid, 'Merchant', mid, mname, mof, 'LOCATED_IN', {}, 'City:' + ckey, 'City', cname, {'state': _s(m.get('state'))}))
    else:
        out.append(_row(cid, 'Receipt', rid, rname, rof, '', {}, '', '', '', {}))
    for it in d.get('items') or []:
        iname = _s((it or {}).get('name'))
        ikey = _norm(iname)
        if not ikey:
            continue
        out.append(_row(cid, 'Receipt', rid, rname, rof, 'CONTAINS', {'quantity': _s(it.get('quantity')), 'price': _s(it.get('price'))}, 'Item:' + ikey, 'Item', iname, {}))
    return out
