from elasticsearch import Elasticsearch
from datetime import datetime, timedelta

es = Elasticsearch(["http://127.0.0.1:9200"])

def evaluate_pump_impact(hours=12):
    print(" ÉVALUATION D'IMPACT ATTAQUE POMPE (MITRE T0855)\n")
    start = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    # Commandes envoyées à la pompe
    cmds = es.search(index="ics-cmd-*", body={
        "query": {"bool": {"must": [
            {"term": {"tag.keyword": "pompe"}},
            {"range": {"@timestamp": {"gte": start}}}
        ]}},
        "sort": [{"@timestamp": "asc"}],
        "size": 1000
    })['hits']['hits']

    # États réels observés (télémetrie)
    states = es.search(index="ics-process-pompe-*", body={
        "query": {"bool": {"must": [
            {"term": {"tag.keyword": "pompe"}},
            {"range": {"@timestamp": {"gte": start}}}
        ]}},
        "sort": [{"@timestamp": "asc"}],
        "size": 1000
    })['hits']['hits']

    print(f"Commandes détectées  : {len(cmds)}")
    print(f"États observés       : {len(states)}\n")

    discordances = 0
    for cmd in cmds:
        cmd_time = cmd['_source']['@timestamp']
        cmd_val = cmd['_source'].get('value')

        for state in states:
            if state['_source']['@timestamp'] > cmd_time:
                state_val = state['_source'].get('value')
                if cmd_val != state_val:
                    discordances += 1
                    print(f"❌ DISCORDANCE → {cmd_time[:19]} | Commande={cmd_val} → État réel={state_val}")
                break

    score = (discordances * 100) // max(1, len(cmds)) if cmds else 0

    print("\n=== RAPPORT D'IMPACT MITRE T0855 ===")
    print(f"Discordances détectées : {discordances}/{len(cmds)}")
    print(f"Score d'impact         : {score}/100")
    if score >= 50:
        print(" ATTAQUE CONFIRMÉE (modification non autorisée de l'état de la pompe)")
    elif score >= 25:
        print(" Anomalie importante détectée")
    else:
        print(" Comportement normal")

# Exécuter sur les dernières 12 heures
evaluate_pump_impact(hours=12)
