#!/bin/bash
# Run this after deploy-ecs.sh to check if the container is up,
# and to get the public IP you'll use to test the backend.
# Just run: bash check-status.sh

REGION="ap-southeast-2"

echo "== Checking service status =="
aws ecs describe-services \
  --cluster second-brain-cluster \
  --services second-brain-backend-service \
  --region $REGION \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount,events:events[0:3]}' \
  --output table

echo ""
echo "== Finding the running task =="
TASK_ARN=$(aws ecs list-tasks \
  --cluster second-brain-cluster \
  --service-name second-brain-backend-service \
  --region $REGION \
  --query 'taskArns[0]' --output text)

if [ "$TASK_ARN" == "None" ] || [ -z "$TASK_ARN" ]; then
  echo "No task found yet — it may still be starting. Wait 30s and re-run this script."
  exit 0
fi

echo "Task: $TASK_ARN"

TASK_STATUS=$(aws ecs describe-tasks \
  --cluster second-brain-cluster \
  --tasks $TASK_ARN \
  --region $REGION \
  --query 'tasks[0].lastStatus' --output text)
echo "Task status: $TASK_STATUS"

if [ "$TASK_STATUS" != "RUNNING" ]; then
  echo "Still starting ($TASK_STATUS) — wait a bit and re-run this script."
  echo "If it says STOPPED, run this to see why:"
  echo "  aws ecs describe-tasks --cluster second-brain-cluster --tasks $TASK_ARN --region $REGION --query 'tasks[0].stoppedReason'"
  exit 0
fi

echo ""
echo "== Getting public IP =="
ENI_ID=$(aws ecs describe-tasks \
  --cluster second-brain-cluster \
  --tasks $TASK_ARN \
  --region $REGION \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
  --output text)

PUBLIC_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids $ENI_ID \
  --region $REGION \
  --query 'NetworkInterfaces[0].Association.PublicIp' \
  --output text)

echo ""
echo "=========================================="
echo "Backend is running at: http://$PUBLIC_IP:8000"
echo "Test it:  curl http://$PUBLIC_IP:8000/health"
echo ""
echo "Use this as VITE_API_BASE_URL in the frontend:"
echo "  http://$PUBLIC_IP:8000/api"
echo "=========================================="
