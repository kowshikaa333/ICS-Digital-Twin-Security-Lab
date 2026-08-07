from elasticsearch import Elasticsearch
# NOTE: This script targets the original team network configuration
# (192.168.6.156) and the original Elasticsearch index schema
# (ics-process-pompe-*). This host is not reachable in the current
# deployment. Thesis Chapter 5 results were captured against the
# live schema (ics-process-state-* / ics-process-val-*) reachable
# at localhost:9200 -- see the note in docs/RESULTS_command_injection.md.
from datetime import datetime, timedelta, timezone
import time

es = Elasticsearch(["http://192.168.6.156:9200"])

print("Détection TEMPS RÉEL + IMPACT PHYSIQUE - MITRE T0855")
print("Surveillance Pompe + Niveau Cuve\n")
print("Ctrl+C pour arrêter\n")

try:
    while True:
        now = datetime.now(timezone.utc)
        start = (now - timedelta(minutes=5)).isoformat()

        # Commandes envoyées à la pompe
        cmds = es.search(index="ics-cmd-*", body={
            "query": {"bool": {"must": [
                {"term": {"tag.keyword": "pompe"}},
                {"range": {"@timestamp": {"gte": start}}}
            ]}},
            "sort": [{"@timestamp": "desc"}],
            "size": 20
        })['hits']['hits']

        # États réels de la pompe
        states = es.search(index="ics-process-pompe-*", body={
            "query": {"bool": {"must": [
                {"term": {"tag.keyword": "pompe"}},
                {"range": {"@timestamp": {"gte": start}}}
            ]}},
            "sort": [{"@timestamp": "desc"}],
            "size": 50
        })['hits']['hits']

        # Niveau physique de la cuve (impact réel)
        levels = es.search(index="ics-process-val-*", body={
            "query": {"bool": {"must": [
                {"term": {"tag.keyword": "niveauout"}},
                {"range": {"@timestamp": {"gte": start}}}
            ]}},
            "sort": [{"@timestamp": "desc"}],
            "size": 10
        })['hits']['hits']

        discord = 0
        for cmd in cmds:
            ctime = cmd['_source']['@timestamp']
            cval = str(cmd['_source'].get('value')).lower().strip()

            for state in states:
                if state['_source']['@timestamp'] > ctime:
                    sval = str(state['_source'].get('value')).lower().strip()
                    if cval != sval and cval not in ["", "none"] and sval not in ["", "none"]:
                        discord += 1
                        print(f" DISCORDANCE → {ctime[11:19]} | Cmd={cval} → Réel={sval}")
                    break

        # Niveau actuel de la cuve
        current_level = levels[0]['_source'].get('value') if levels else "?"

        print(f"[{now.strftime('%H:%M:%S')}] Cmds={len(cmds)} | États={len(states)} | Niveau={current_level} | Discord={discord}")

        if discord > 0:
            print(f" ALERTE IMPACT PHYSIQUE POSSIBLE (Score ≈ {discord*25}/100)")

        time.sleep(5)

except KeyboardInterrupt:
    print("\n\nArrêt du moteur de détection temps réel.")
except Exception as e:
    print(f"Erreur: {e}")
