#!/usr/bin/env python3
"""Validate and atomically deliver a human/agent-selected file-IPC model response.

This helper performs no model inference or business actions. The independent actor
reads each request and supplies its chosen output as a JSON file.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def validate(value, schema, path='$'):
    expected = schema.get('type')
    types = {'object': dict, 'array': list, 'string': str, 'boolean': bool,
             'number': (int, float), 'integer': int, 'null': type(None)}
    if isinstance(expected, str) and expected in types:
        assert isinstance(value, types[expected]), f'{path}: expected {expected}'
        if expected in ('number', 'integer'):
            assert not isinstance(value, bool), f'{path}: boolean is not a number'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if 'exclusiveMinimum' in schema:
            assert value > schema['exclusiveMinimum'], f'{path}: below exclusive minimum'
        if 'maximum' in schema:
            assert value <= schema['maximum'], f'{path}: above maximum'
    if 'enum' in schema:
        assert value in schema['enum'], f'{path}: invalid enum value'
    if isinstance(value, dict):
        assert set(schema.get('required', [])) <= value.keys(), f'{path}: missing required keys'
        properties = schema.get('properties', {})
        if schema.get('additionalProperties') is False:
            assert value.keys() <= properties.keys(), f'{path}: unexpected keys'
        for key, item in value.items():
            if key in properties:
                validate(item, properties[key], f'{path}.{key}')
    if isinstance(value, list) and isinstance(schema.get('items'), dict):
        for index, item in enumerate(value):
            validate(item, schema['items'], f'{path}[{index}]')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('request', type=Path)
    parser.add_argument('chosen_output', type=Path)
    parser.add_argument('--trace', type=Path, required=True)
    args = parser.parse_args()
    envelope = json.loads(args.request.read_text())
    assert envelope['schemaVersion'] == '1'
    request = envelope['request']
    assert digest(request) == envelope['requestHash'], 'Request hash mismatch'
    request_id = envelope['requestId']
    assert args.request.name == request_id + '.json', 'Request ID filename mismatch'
    chosen = json.loads(args.chosen_output.read_text())
    assert set(chosen) == {'message', 'toolCalls', 'finishReason'}
    assert isinstance(chosen['message'], str)
    assert chosen['finishReason'] in ('stop', 'tool-calls', 'length', 'error')
    assert isinstance(chosen['toolCalls'], list)
    assert bool(chosen['toolCalls']) == (chosen['finishReason'] == 'tool-calls')
    tools = {tool['name']: tool for tool in request['tools']}
    ids = set()
    for call in chosen['toolCalls']:
        assert set(call) == {'callId', 'name', 'arguments'}
        assert isinstance(call['callId'], str) and call['callId'] and call['callId'] not in ids
        ids.add(call['callId'])
        assert call['name'] in tools, 'Undeclared tool'
        assert isinstance(call['arguments'], dict)
        validate(call['arguments'], tools[call['name']]['inputSchema'])
    model_response = {'schemaVersion': '1', 'requestId': request_id,
                      'mode': 'simulated', **chosen}
    response = {'schemaVersion': '1', 'requestId': request_id,
                'requestHash': envelope['requestHash'], 'provider': 'subagent_simulation',
                'usage': 'unmeasured', 'response': model_response}
    destination = args.request.parent.parent / 'responses' / args.request.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    assert not destination.exists(), 'Refusing to overwrite an existing response'
    temp = destination.with_suffix('.json.tmp')
    temp.write_text(json.dumps(response, indent=2, ensure_ascii=False) + '\n')
    os.replace(temp, destination)
    args.trace.parent.mkdir(parents=True, exist_ok=True)
    with args.trace.open('a') as trace:
        trace.write(json.dumps({'requestId': request_id, 'requestHash': envelope['requestHash'],
                                'responseHash': digest(response), 'response': response}, ensure_ascii=False) + '\n')
    print(json.dumps({'requestId': request_id, 'requestHash': envelope['requestHash'],
                      'responseHash': digest(response), 'responsePath': str(destination)}))


if __name__ == '__main__':
    main()
