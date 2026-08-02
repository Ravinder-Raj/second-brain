#!/bin/bash
# One-time ECS setup for Second Brain backend.
# Just run: bash deploy-ecs.sh
# It prints what it's doing at each step — you don't need to type anything else.

set -e  # stop immediately if any step fails, instead of plowing ahead broken

REGION="ap-southeast-2"
ACCOUNT_ID="319918321593"
IMAGE_URI="319918321593.dkr.ecr.ap-southeast-2.amazonaws.com/second-brain-backend:latest"
SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:319918321593:secret:second-brain/production-djmqUY"
EXEC_ROLE_ARN="arn:aws:iam::319918321593:role/ecsTaskExecutionRole"

echo "== Step 1/6: Creating ECS cluster =="
aws ecs create-cluster --cluster-name second-brain-cluster --region $REGION

echo "== Step 2/6: Finding your default VPC and subnets =="
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' --output text --region $REGION)
echo "Using VPC: $VPC_ID"

SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].SubnetId' --output text --region $REGION)
SUBNET_1=$(echo $SUBNET_IDS | awk '{print $1}')
echo "Using subnet: $SUBNET_1"

echo "== Step 3/6: Creating a security group that allows the app through =="
SG_ID=$(aws ec2 create-security-group \
  --group-name second-brain-sg \
  --description "Allow inbound 8000 for second-brain backend" \
  --vpc-id $VPC_ID --region $REGION \
  --query 'GroupId' --output text)
echo "Created security group: $SG_ID"

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID --protocol tcp --port 8000 --cidr 0.0.0.0/0 --region $REGION

echo "== Step 4/6: Writing the task definition =="
cat > task-definition.json <<EOF
{
  "family": "second-brain-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "second-brain-backend",
      "image": "$IMAGE_URI",
      "portMappings": [{"containerPort": 8000, "protocol": "tcp"}],
      "secrets": [
        {"name": "NVIDIA_API_KEY", "valueFrom": "$SECRET_ARN:NVIDIA_API_KEY::"},
        {"name": "NEO4J_URI", "valueFrom": "$SECRET_ARN:NEO4J_URI::"},
        {"name": "NEO4J_USERNAME", "valueFrom": "$SECRET_ARN:NEO4J_USERNAME::"},
        {"name": "NEO4J_PASSWORD", "valueFrom": "$SECRET_ARN:NEO4J_PASSWORD::"},
        {"name": "AWS_REGION", "valueFrom": "$SECRET_ARN:AWS_REGION::"},
        {"name": "S3_BUCKET_UPLOADS", "valueFrom": "$SECRET_ARN:S3_BUCKET_UPLOADS::"},
        {"name": "S3_BUCKET_FRONTEND", "valueFrom": "$SECRET_ARN:S3_BUCKET_FRONTEND::"},
        {"name": "SQS_QUEUE_URL", "valueFrom": "$SECRET_ARN:SQS_QUEUE_URL::"},
        {"name": "APP_ENV", "valueFrom": "$SECRET_ARN:APP_ENV::"},
        {"name": "ALLOWED_ORIGINS", "valueFrom": "$SECRET_ARN:ALLOWED_ORIGINS::"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/second-brain-backend",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ]
}
EOF
echo "Task definition written."

echo "== Step 5/6: Registering the task definition with AWS =="
aws ecs register-task-definition --cli-input-json file://task-definition.json --region $REGION

echo "== Step 6/6: Creating the ECS service (this actually starts the container) =="
aws ecs create-service \
  --cluster second-brain-cluster \
  --service-name second-brain-backend-service \
  --task-definition second-brain-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region $REGION

echo ""
echo "=========================================="
echo "Done. The container is starting now — this takes 1-2 minutes."
echo "Run this to check on it and get its public IP once it's running:"
echo ""
echo "  bash check-status.sh"
echo "=========================================="
