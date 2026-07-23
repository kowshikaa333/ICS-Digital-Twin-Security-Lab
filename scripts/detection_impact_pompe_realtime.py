from elasticsearch import Elasticsearch
from datetime import datetime, timedelta, timezone
import time

es = Elasticsearch(["http://192.168.6.156:9200"])

print("🚀 Moteur DEBUG - MITRE T0855 (Ultra Verbose)")
print("Surveillance continue...\n")

try:
    while True:
        now = datetime.now(timezone.utc)
        start = (now - timedelta(minutes=10)).isoformat()

        # === COMMANDES ===
        cmds = es.search(index="ics-cmd-*", body={
            "query": {"bool": {"must": [{"term": {"tag.keyword": "pompe"}}, {"range": {"@timestamp": {"gte": start}}}]}},
            "sort": [{"@timestamp": "asc"}], "size": 50
        })['hits']['hits']

        # === ÉTATS RÉELS ===
        states = es.search(index="ics-process-pompe-*", body={
            "query": {"bool": {"must": [{"term": {"tag.keyword": "pompe"}}, {"range": {"@timestamp": {"gte": start}}}]}},
            "sort": [{"@timestamp": "asc"}], "size": 100
        })['hits']['hits']

        print(f"\n[{now.strftime('%H:%M:%S')}] Commandes trouvées : {len(cmds)} | États trouvés : {len(states)}")

        discordances = 0
        for cmd in cmds:
            ctime = cmd['_source']['@timestamp']
            cval = str(cmd['_source'].get('value')).lower()
            print(f"   Commande → {ctime[11:19]} | Valeur={cval}")

            for state in states:
                if state['_source']['@timestamp'] > ctime:
                    sval = str(state['_source'].get('value')).lower()
                    if cval != sval:
                        discordances += 1
                        print(f"   🚨 DISCORDANCE → {ctime[11:19]} | Cmd={cval} → Réel={sval}")
                    break

        if discordances > 0:
            print(f"⚠️  ALERTE T0855 → {discordances} discordance(s) détectée(s) !")

        time.sleep(6)

except KeyboardInterrupt:
    print("\nArrêt du moteur.")
except Exception as e:
    print(f"Erreur: {e}")
